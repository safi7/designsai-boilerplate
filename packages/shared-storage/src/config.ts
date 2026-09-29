import { z } from 'zod';
import type { S3ClientConfig } from '@aws-sdk/client-s3';

export const StorageConfigSchema = z.object({
  provider: z.enum(['minio', 's3']),
  /** Endpoint the service uses (in Docker: the internal `minio` hostname). */
  endpoint: z.string().url().optional(),
  /** Endpoint baked into presigned URLs handed to browsers (MinIO only). */
  publicEndpoint: z.string().url().optional(),
  region: z.string().default('us-east-1'),
  bucket: z.string().min(1),
  accessKeyId: z.string().min(1).optional(),
  secretAccessKey: z.string().min(1).optional(),
  pathStyle: z.boolean().default(true),
  presignedUrlExpiry: z.number().int().min(1).max(604_800).default(3600),
});

export type StorageConfig = z.infer<typeof StorageConfigSchema>;

/**
 * Build storage config from the environment.
 *
 * - `minio` (local): endpoint + static credentials with dev defaults.
 * - `s3` (cloud): credentials are optional so IAM roles (IRSA / instance
 *   profiles) are picked up by the SDK's default provider chain.
 */
export function loadStorageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const provider = env.STORAGE_PROVIDER === 's3' ? 's3' : 'minio';
  const isMinio = provider === 'minio';

  const result = StorageConfigSchema.safeParse({
    provider,
    endpoint: isMinio ? (env.STORAGE_ENDPOINT ?? 'http://localhost:9000') : env.STORAGE_ENDPOINT || undefined,
    publicEndpoint: env.STORAGE_PUBLIC_ENDPOINT || undefined,
    region: env.STORAGE_REGION ?? 'us-east-1',
    bucket: env.STORAGE_BUCKET ?? 'boilerplate-assets',
    accessKeyId: env.STORAGE_ACCESS_KEY_ID || (isMinio ? 'minioadmin' : undefined),
    secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY || (isMinio ? 'minioadmin' : undefined),
    pathStyle: env.STORAGE_PATH_STYLE ? env.STORAGE_PATH_STYLE !== 'false' : isMinio,
    presignedUrlExpiry: env.STORAGE_PRESIGNED_URL_EXPIRY ? Number(env.STORAGE_PRESIGNED_URL_EXPIRY) : 3600,
  });

  if (!result.success) {
    throw new Error(`Invalid storage configuration: ${result.error.message}`);
  }
  return result.data;
}

function baseClientConfig(config: StorageConfig): S3ClientConfig {
  return {
    region: config.region,
    forcePathStyle: config.pathStyle,
    ...(config.accessKeyId && config.secretAccessKey
      ? { credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } }
      : {}),
  };
}

export function getS3ClientConfig(config: StorageConfig): S3ClientConfig {
  return { ...baseClientConfig(config), ...(config.endpoint ? { endpoint: config.endpoint } : {}) };
}

/** Presigned URLs must be reachable by the browser, so prefer the public endpoint. */
export function getS3PresignerConfig(config: StorageConfig): S3ClientConfig {
  const endpoint = config.publicEndpoint ?? config.endpoint;
  return { ...baseClientConfig(config), ...(endpoint ? { endpoint } : {}) };
}
