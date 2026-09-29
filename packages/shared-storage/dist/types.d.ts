export interface UploadOptions {
    contentType?: string;
    metadata?: Record<string, string>;
    /** Byte length for streamed bodies, so the SDK can sign without buffering. */
    contentLength?: number;
    cacheControl?: string;
}
export interface ObjectMetadata {
    key: string;
    size: number;
    lastModified: Date;
    etag: string;
    contentType?: string;
    metadata?: Record<string, string>;
}
export interface ListOptions {
    prefix?: string;
    maxKeys?: number;
    continuationToken?: string;
}
export interface ListResult {
    objects: ObjectMetadata[];
    isTruncated: boolean;
    nextContinuationToken?: string;
}
export interface PresignedUrlOptions {
    expiresIn?: number;
    method?: 'GET' | 'PUT';
    /** PUT only: the Content-Type the client must send. */
    contentType?: string;
    /**
     * GET only. Signed into the canonical request — appending it to the URL
     * after signing would break SigV4 verification.
     */
    responseContentDisposition?: string;
}
export declare class StorageError extends Error {
    readonly operation: string;
    readonly statusCode?: number | undefined;
    constructor(message: string, operation: string, statusCode?: number | undefined, options?: {
        cause?: unknown;
    });
}
//# sourceMappingURL=types.d.ts.map