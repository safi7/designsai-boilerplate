import { loadStorageConfig, ObjectStorageService } from '@boilerplate/shared-storage';
import { config } from './config.js';
import { log } from './logger.js';

export const storage = new ObjectStorageService(loadStorageConfig());

/**
 * Local MinIO starts empty, so create the bucket on boot. In the cloud the
 * bucket is provisioned by infrastructure and the API role usually lacks
 * CreateBucket, so failures there are logged, not fatal.
 */
export async function initializeStorage(): Promise<void> {
  try {
    await storage.ensureBucket();
    log.info('Object storage ready', { bucket: storage.bucket });
  } catch (error) {
    const level = config.isProduction ? 'warn' : 'error';
    log[level]('Object storage bucket check failed', { bucket: storage.bucket, error: error instanceof Error ? error.message : String(error) });
  }
}
