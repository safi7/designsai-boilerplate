import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';
import { getS3ClientConfig, getS3PresignerConfig, type StorageConfig } from './config.js';
import { StorageError, type ListOptions, type ListResult, type ObjectMetadata, type PresignedUrlOptions, type UploadOptions } from './types.js';

function statusOf(error: unknown): number | undefined {
  const e = error as { $metadata?: { httpStatusCode?: number }; statusCode?: number };
  return e?.$metadata?.httpStatusCode ?? e?.statusCode;
}

function isNotFound(error: unknown): boolean {
  const name = (error as { name?: string })?.name;
  return statusOf(error) === 404 || name === 'NotFound' || name === 'NoSuchKey';
}

/**
 * S3 metadata travels as `x-amz-meta-*` headers; only a small ASCII subset is
 * safe there. Anything else breaks signatures or header parsing.
 */
export function sanitizeMetadata(metadata: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(metadata).map(([k, v]) => [
      k,
      v
        .replace(/[^0-9a-zA-Z !_.*'() -]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 1024) || '_',
    ])
  );
}

/**
 * Object storage over the S3 API. The same code path serves MinIO locally and
 * AWS S3 in the cloud — only configuration differs.
 */
export class ObjectStorageService {
  private readonly client: S3Client;
  private readonly presigner: S3Client;

  constructor(private readonly config: StorageConfig) {
    this.client = new S3Client(getS3ClientConfig(config));
    this.presigner = new S3Client(getS3PresignerConfig(config));
  }

  get bucket(): string {
    return this.config.bucket;
  }

  async upload(key: string, body: Buffer | Readable | string, options: UploadOptions = {}): Promise<void> {
    await this.run('upload', () =>
      this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Body: body,
          ContentType: options.contentType,
          ContentLength: options.contentLength,
          CacheControl: options.cacheControl,
          Metadata: options.metadata ? sanitizeMetadata(options.metadata) : undefined,
        })
      )
    );
  }

  async download(key: string): Promise<Buffer> {
    return this.run('download', async () => {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key }));
      if (!response.Body) throw new Error('Empty response body');
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as Readable) chunks.push(chunk as Uint8Array);
      return Buffer.concat(chunks);
    });
  }

  async delete(key: string): Promise<void> {
    await this.run('delete', () => this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key })));
  }

  async getMetadata(key: string): Promise<ObjectMetadata | null> {
    try {
      const response = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }));
      return {
        key,
        size: response.ContentLength ?? 0,
        lastModified: response.LastModified ?? new Date(),
        etag: response.ETag ?? '',
        contentType: response.ContentType,
        metadata: response.Metadata,
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw this.wrap(error, 'getMetadata');
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.getMetadata(key)) !== null;
  }

  async list(options: ListOptions = {}): Promise<ListResult> {
    return this.run('list', async () => {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: options.prefix,
          MaxKeys: options.maxKeys,
          ContinuationToken: options.continuationToken,
        })
      );
      return {
        objects: (response.Contents ?? []).map(obj => ({
          key: obj.Key ?? '',
          size: obj.Size ?? 0,
          lastModified: obj.LastModified ?? new Date(),
          etag: obj.ETag ?? '',
        })),
        isTruncated: response.IsTruncated ?? false,
        nextContinuationToken: response.NextContinuationToken,
      };
    });
  }

  async getPresignedUrl(key: string, options: PresignedUrlOptions = {}): Promise<string> {
    const expiresIn = options.expiresIn ?? this.config.presignedUrlExpiry;
    return this.run('getPresignedUrl', () => {
      const command =
        options.method === 'PUT'
          ? new PutObjectCommand({ Bucket: this.config.bucket, Key: key, ContentType: options.contentType })
          : new GetObjectCommand({ Bucket: this.config.bucket, Key: key, ResponseContentDisposition: options.responseContentDisposition });
      return getSignedUrl(this.presigner, command, { expiresIn });
    });
  }

  /** Idempotently create the bucket (local MinIO bootstrap). */
  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
    } catch (error) {
      if (!isNotFound(error) && statusOf(error) !== 403) throw this.wrap(error, 'ensureBucket');
      await this.run('createBucket', () => this.client.send(new CreateBucketCommand({ Bucket: this.config.bucket })));
    }
  }

  private async run<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw this.wrap(error, operation);
    }
  }

  private wrap(error: unknown, operation: string): StorageError {
    if (error instanceof StorageError) return error;
    const message = error instanceof Error ? error.message : String(error);
    return new StorageError(`Storage ${operation} failed: ${message}`, operation, statusOf(error), { cause: error });
  }
}
