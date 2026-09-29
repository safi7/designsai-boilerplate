import type { Readable } from 'node:stream';
import { type StorageConfig } from './config.js';
import { type ListOptions, type ListResult, type ObjectMetadata, type PresignedUrlOptions, type UploadOptions } from './types.js';
/**
 * S3 metadata travels as `x-amz-meta-*` headers; only a small ASCII subset is
 * safe there. Anything else breaks signatures or header parsing.
 */
export declare function sanitizeMetadata(metadata: Record<string, string>): Record<string, string>;
/**
 * Object storage over the S3 API. The same code path serves MinIO locally and
 * AWS S3 in the cloud — only configuration differs.
 */
export declare class ObjectStorageService {
    private readonly config;
    private readonly client;
    private readonly presigner;
    constructor(config: StorageConfig);
    get bucket(): string;
    upload(key: string, body: Buffer | Readable | string, options?: UploadOptions): Promise<void>;
    download(key: string): Promise<Buffer>;
    delete(key: string): Promise<void>;
    getMetadata(key: string): Promise<ObjectMetadata | null>;
    exists(key: string): Promise<boolean>;
    list(options?: ListOptions): Promise<ListResult>;
    getPresignedUrl(key: string, options?: PresignedUrlOptions): Promise<string>;
    /** Idempotently create the bucket (local MinIO bootstrap). */
    ensureBucket(): Promise<void>;
    private run;
    private wrap;
}
//# sourceMappingURL=service.d.ts.map