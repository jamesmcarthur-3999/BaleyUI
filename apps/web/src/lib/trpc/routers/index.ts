import { router } from '../trpc';
import { workspacesRouter } from './workspaces';
import { connectionsRouter } from './connections';
import { blocksRouter } from './blocks';
import { flowsRouter } from './flows';
import { decisionsRouter } from './decisions';
import { webhooksRouter } from './webhooks';
import { patternsRouter } from './patterns';
import { analyticsRouter } from './analytics';
import { codegenRouter } from './codegen';
import { apiKeysRouter } from './api-keys';
import { baleybotsRouter } from './baleybots';
import { policiesRouter } from './policies';
import { toolsRouter } from './tools';
import { triggersRouter } from './triggers';

export const appRouter = router({
  workspaces: workspacesRouter,
  connections: connectionsRouter,
  blocks: blocksRouter,
  flows: flowsRouter,
  decisions: decisionsRouter,
  webhooks: webhooksRouter,
  patterns: patternsRouter,
  analytics: analyticsRouter,
  codegen: codegenRouter,
  apiKeys: apiKeysRouter,
  baleybots: baleybotsRouter,
  policies: policiesRouter,
  tools: toolsRouter,
  triggers: triggersRouter,
});

export type AppRouter = typeof appRouter;
