import { config } from './lib/config.js';
import { prisma } from './lib/database.js';
import { log } from './lib/logger.js';
import { redis, redisSubscriber } from './lib/redis.js';
import { storage } from './lib/storage.js';
import { auditService } from './lib/audit.js';
import { AuthService } from './services/auth.service.js';
import { CreditService } from './services/credit.service.js';
import { EmailService } from './services/email.service.js';
import { GoogleAuthService } from './services/google-auth.service.js';
import { OtpService } from './services/otp.service.js';
import { PaymentService } from './services/payment.service.js';
import { SessionService } from './services/session.service.js';
import { UserService } from './services/user.service.js';
import { AgentsClient } from './services/agents/agents-client.js';
import { ThreadDirectory } from './services/agents/thread-directory.js';
import { AskAiConversationService } from './services/agents/ask-ai/conversation.service.js';
import { AskAiEventStore } from './services/agents/ask-ai/event-store.js';
import { StreamHub } from './services/agents/ask-ai/stream-hub.js';
import { TurnRunner } from './services/agents/ask-ai/turn-runner.js';

/**
 * Composition root: the only module that wires concrete infrastructure into
 * services. Everything else receives its collaborators through constructors,
 * which keeps services unit-testable with plain fakes.
 */
function buildContainer() {
  const email = new EmailService(config.email, log);
  const sessions = new SessionService(prisma, redis, log, config.auth.sessionTtlSeconds);
  const users = new UserService(prisma, storage, log);
  const credits = new CreditService(prisma, log);
  const otp = new OtpService(redis, email, config.app);
  const google = new GoogleAuthService(config.google.clientId);
  const auth = new AuthService({ prisma, users, sessions, otp, credits, email, google, audit: auditService, logger: log, config });
  const payments = new PaymentService({ prisma, credits, email, audit: auditService, logger: log, config });

  const agents = new AgentsClient(config.agents.baseUrl, config.agents.token, log);
  const threads = new ThreadDirectory(prisma);
  const events = new AskAiEventStore(prisma);
  const hub = new StreamHub(redis, redisSubscriber, log);
  const runner = new TurnRunner({ prisma, events, hub, threads, agents, credits, logger: log, config: config.askAi });
  const askAi = new AskAiConversationService({ prisma, threads, events, hub, runner, credits, config: config.askAi });

  return {
    config,
    prisma,
    redis,
    redisSubscriber,
    storage,
    log,
    audit: auditService,
    email,
    sessions,
    users,
    credits,
    otp,
    google,
    auth,
    payments,
    agents,
    threads,
    events,
    hub,
    runner,
    askAi,
  };
}

export type Container = ReturnType<typeof buildContainer>;

export const container: Container = buildContainer();
