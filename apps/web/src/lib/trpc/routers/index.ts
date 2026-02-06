import { router } from '../trpc';
import { workspacesRouter } from './workspaces';
import { connectionsRouter } from './connections';
import { webhooksRouter } from './webhooks';
import { patternsRouter } from './patterns';
import { analyticsRouter } from './analytics';
import { codegenRouter } from './codegen';
import { apiKeysRouter } from './api-keys';
import { baleybotsRouter } from './baleybots';
import { policiesRouter } from './policies';
import { toolsRouter } from './tools';
import { triggersRouter } from './triggers';
import { notificationsRouter } from './notifications';
import { memoryRouter } from './memory';
import { scheduledTasksRouter } from './scheduled-tasks';
import { adminRouter } from './admin';

export const appRouter = router({
  workspaces: workspacesRouter,
  connections: connectionsRouter,
  webhooks: webhooksRouter,
  patterns: patternsRouter,
  analytics: analyticsRouter,
  codegen: codegenRouter,
  apiKeys: apiKeysRouter,
  baleybots: baleybotsRouter,
  policies: policiesRouter,
  tools: toolsRouter,
  triggers: triggersRouter,
  notifications: notificationsRouter,
  memory: memoryRouter,
  scheduledTasks: scheduledTasksRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
