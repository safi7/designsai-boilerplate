import { createServiceLogger } from '@boilerplate/shared-logger';
import { config } from './config.js';
export const log = createServiceLogger('api', { environment: config.env, level: config.logLevel });
//# sourceMappingURL=logger.js.map