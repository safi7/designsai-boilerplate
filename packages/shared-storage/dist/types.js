export class StorageError extends Error {
    operation;
    statusCode;
    constructor(message, operation, statusCode, options) {
        super(message, options);
        this.operation = operation;
        this.statusCode = statusCode;
        this.name = 'StorageError';
    }
}
//# sourceMappingURL=types.js.map