import { z } from 'zod';
import type { S3ClientConfig } from '@aws-sdk/client-s3';
export declare const StorageConfigSchema: z.ZodObject<{
    provider: z.ZodEnum<["minio", "s3"]>;
    /** Endpoint the service uses (in Docker: the internal `minio` hostname). */
    endpoint: z.ZodOptional<z.ZodString>;
    /** Endpoint baked into presigned URLs handed to browsers (MinIO only). */
    publicEndpoint: z.ZodOptional<z.ZodString>;
    region: z.ZodDefault<z.ZodString>;
    bucket: z.ZodString;
    accessKeyId: z.ZodOptional<z.ZodString>;
    secretAccessKey: z.ZodOptional<z.ZodString>;
    pathStyle: z.ZodDefault<z.ZodBoolean>;
    presignedUrlExpiry: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    provider: "minio" | "s3";
    region: string;
    bucket: string;
    pathStyle: boolean;
    presignedUrlExpiry: number;
    endpoint?: string | undefined;
    publicEndpoint?: string | undefined;
    accessKeyId?: string | undefined;
    secretAccessKey?: string | undefined;
}, {
    provider: "minio" | "s3";
    bucket: string;
    endpoint?: string | undefined;
    publicEndpoint?: string | undefined;
    region?: string | undefined;
    accessKeyId?: string | undefined;
    secretAccessKey?: string | undefined;
    pathStyle?: boolean | undefined;
    presignedUrlExpiry?: number | undefined;
}>;
export type StorageConfig = z.infer<typeof StorageConfigSchema>;
/**
 * Build storage config from the environment.
 *
 * - `minio` (local): endpoint + static credentials with dev defaults.
 * - `s3` (cloud): credentials are optional so IAM roles (IRSA / instance
 *   profiles) are picked up by the SDK's default provider chain.
 */
export declare function loadStorageConfig(env?: NodeJS.ProcessEnv): StorageConfig;
export declare function getS3ClientConfig(config: StorageConfig): S3ClientConfig;
/** Presigned URLs must be reachable by the browser, so prefer the public endpoint. */
export declare function getS3PresignerConfig(config: StorageConfig): S3ClientConfig;
//# sourceMappingURL=config.d.ts.map