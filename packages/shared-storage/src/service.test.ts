import { describe, expect, it } from 'vitest';
import { getS3PresignerConfig, loadStorageConfig } from './config.js';
import { ObjectStorageService, sanitizeMetadata } from './service.js';

describe('loadStorageConfig', () => {
  it('defaults to MinIO with local credentials', () => {
    const config = loadStorageConfig({});
    expect(config.provider).toBe('minio');
    expect(config.endpoint).toBe('http://localhost:9000');
    expect(config.accessKeyId).toBe('minioadmin');
    expect(config.pathStyle).toBe(true);
  });

  it('leaves S3 credentials to the SDK provider chain when not set', () => {
    const config = loadStorageConfig({ STORAGE_PROVIDER: 's3', STORAGE_BUCKET: 'prod-assets' });
    expect(config.accessKeyId).toBeUndefined();
    expect(config.endpoint).toBeUndefined();
    expect(config.pathStyle).toBe(false);
  });

  it('uses the public endpoint for browser-facing presigned URLs', () => {
    const config = loadStorageConfig({ STORAGE_ENDPOINT: 'http://minio:9000', STORAGE_PUBLIC_ENDPOINT: 'http://localhost:9000' });
    expect(getS3PresignerConfig(config).endpoint).toBe('http://localhost:9000');
  });
});

describe('sanitizeMetadata', () => {
  it('replaces characters that are unsafe in x-amz-meta headers', () => {
    expect(sanitizeMetadata({ name: 'café "logo".png' })).toEqual({ name: 'caf_ _logo_.png' });
  });
});

describe('ObjectStorageService.getPresignedUrl', () => {
  it('signs GET URLs against the public endpoint', async () => {
    const service = new ObjectStorageService(
      loadStorageConfig({ STORAGE_ENDPOINT: 'http://minio:9000', STORAGE_PUBLIC_ENDPOINT: 'http://localhost:9000', STORAGE_BUCKET: 'assets' })
    );
    const url = await service.getPresignedUrl('avatars/1.png', { expiresIn: 60 });
    expect(url.startsWith('http://localhost:9000/assets/avatars/1.png?')).toBe(true);
    expect(url).toContain('X-Amz-Signature=');
  });
});
