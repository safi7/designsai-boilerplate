import { AuditService } from '@boilerplate/shared-audit';
import { prisma } from './database.js';
import { log } from './logger.js';
export const auditService = new AuditService(prisma, log);
//# sourceMappingURL=audit.js.map