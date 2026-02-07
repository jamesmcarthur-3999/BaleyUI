# Accounts, Workspaces & Teams Architecture

> Comprehensive design for multi-user, multi-workspace support in BaleyUI.
> Status: **Draft** | Author: Claude | Date: 2026-02-07

---

## Table of Contents

1. [Current State & Problems](#1-current-state--problems)
2. [Design Principles](#2-design-principles)
3. [Entity Model](#3-entity-model)
4. [Database Schema](#4-database-schema)
5. [Clerk Integration Strategy](#5-clerk-integration-strategy)
6. [Authentication & Authorization](#6-authentication--authorization)
7. [System API Keys & Consumption Billing](#7-system-api-keys--consumption-billing)
8. [Security Architecture](#8-security-architecture)
9. [Onboarding & User Journey](#9-onboarding--user-journey)
10. [Migration Strategy](#10-migration-strategy)
11. [Testing Strategy](#11-testing-strategy)

---

## 1. Current State & Problems

### What Exists Today

```
Clerk User ──(1:1)──> Workspace ──(1:many)──> [Baleybots, Connections, Tools, ...]
```

- **No `users` table** in the database. Clerk user IDs are scattered as bare strings
  across 8+ columns (`ownerId`, `createdBy`, `deletedBy`, `approvedBy`, `userId`).
- **Single-owner model**: `workspaces.ownerId` is the only access check. If you don't
  own the workspace, you can't touch it.
- **One workspace per user**: Enforced in code (`workspaces.create` throws if you
  already have one).
- **No team concept**: No membership table, no roles, no invitations.
- **No account/org layer**: No billing entity, no usage aggregation point.

### The Onboarding Loop Bug

**Root cause**: After workspace creation, `router.push('/dashboard/baleybots')` navigates
to the dashboard. `WorkspaceGuard` calls `checkWorkspace.useQuery()` which returns a
**stale cached result** (`hasWorkspace: false`) because:

1. `staleTime: 5 * 60 * 1000` (5-minute cache)
2. `refetchOnWindowFocus: false`
3. No cache invalidation after `createWorkspace` mutation

WorkspaceGuard sees `!data.hasWorkspace` and redirects back to `/onboarding`. Loop.

**Fix**: Call `utils.workspaces.checkWorkspace.invalidate()` after workspace creation,
before navigating. Also remove the aggressive staleTime on WorkspaceGuard.

### Files That Reference User Identity (22 distinct locations)

| Pattern | Tables/Files | Impact for Multi-User |
|---------|-------------|----------------------|
| `workspaces.ownerId` | schema.ts, trpc.ts, workspaces.ts, auth/*.ts | **BLOCKING** - core access check |
| `notifications.userId` | schema.ts, notifications.ts, notification-service.ts | **BLOCKING** - per-user filtering |
| `*.createdBy` | baleybots, apiKeys schemas + routers | Medium - audit field |
| `*.approvedBy` | approvalPatterns, scheduledTasks | Medium - audit field |
| `*.deletedBy` | workspaces, connections, tools, baleybots | Low - audit field |
| `ctx.userId` | All 109+ tRPC procedures | **BLOCKING** - auth context |
| `ADMIN_USER_IDS` | trpc.ts | Low - env var list |

---

## 2. Design Principles

1. **Accounts are the billing entity.** Every workspace belongs to an account.
   Consumption is metered at the account level. Invoices go to accounts.

2. **Workspaces are the isolation boundary.** All resources (baleybots, connections,
   tools, executions, memory) are scoped to a workspace. Cross-workspace access
   never happens implicitly.

3. **Users are people.** They have profiles, preferences, and belong to accounts
   through memberships. A user can belong to multiple accounts and access multiple
   workspaces.

4. **Roles are per-workspace, not per-account.** A user might be an admin in one
   workspace and a viewer in another, even within the same account. Account-level
   roles exist but are separate (owner, billing admin, member).

5. **Clerk handles identity, we handle authorization.** Clerk manages authentication,
   user profiles, and organization membership UI. Our database is the source of truth
   for what a user can do within BaleyUI.

6. **System API keys are account-scoped.** Each account gets API keys that can be
   used for programmatic access. Usage is tracked per key and rolled up to the account
   for billing.

7. **Every destructive or billable action is attributable.** We always know which user
   (or API key) performed an action, for audit and billing.

---

## 3. Entity Model

### Hierarchy

```
Account (billing entity, team container)
├── AccountMember (user ↔ account, with account-level role)
│   └── User (synced from Clerk, has preferences)
├── Workspace (isolation boundary for resources)
│   ├── WorkspaceMember (user ↔ workspace, with workspace-level role)
│   ├── Baleybots, Connections, Tools, Flows, ...
│   └── WorkspacePolicy
├── AccountApiKey (system API key for programmatic access)
└── UsageRecord (consumption tracking for billing)
```

### Entity Relationships

```
┌─────────┐       ┌──────────────┐       ┌──────┐
│ Account │──1:N──│AccountMember │──N:1──│ User │
└────┬────┘       └──────────────┘       └──┬───┘
     │                                      │
     │ 1:N                                  │
     │                                      │
┌────┴──────┐     ┌────────────────┐        │
│ Workspace │─1:N─│WorkspaceMember │──N:1───┘
└────┬──────┘     └────────────────┘
     │
     │ 1:N
     │
┌────┴──────────────────────────────────────────────┐
│ Baleybots, Connections, Tools, Flows, ApiKeys,    │
│ Notifications, ScheduledTasks, Policies, Memory,  │
│ Executions, Metrics, Alerts, AuditLogs, ...       │
└───────────────────────────────────────────────────┘
```

### Key Design Decisions

**Why separate Account and Workspace?**
- A company (account) may have multiple workspaces: "Production", "Staging",
  "Experiments". Different team members may have different access to each.
- Billing is per-account (one invoice), but resource isolation is per-workspace.
- An individual user gets a "personal" account with one workspace by default.

**Why not just use Clerk Organizations as accounts?**
- Clerk org metadata is capped at ~1.2KB in session tokens.
- We need rich account data: billing tier, usage quotas, feature flags, policies.
- Clerk doesn't handle billing, usage tracking, or feature gating.
- We want to avoid deep vendor lock-in on business-critical data.
- **Hybrid approach**: Use Clerk Organizations for invitation/membership UI,
  sync to our database via webhooks, use our tables as source of truth for authz.

**Why a `users` table when Clerk manages users?**
- Normalizes user references (FK constraints instead of scattered strings).
- Stores BaleyUI-specific data: default workspace, notification preferences, theme.
- Survives an auth provider migration (if we ever leave Clerk).
- Enables local joins without calling Clerk API on every request.

---

## 4. Database Schema

### New Tables

#### `users`
Local mirror of Clerk users. Synced via webhook on `user.created`/`user.updated`.

```sql
CREATE TABLE users (
  id              VARCHAR(255) PRIMARY KEY,  -- Clerk user ID (e.g., "user_2abc...")
  email           VARCHAR(255) NOT NULL,
  name            VARCHAR(255),
  avatar_url      VARCHAR(2000),
  default_workspace_id UUID,                 -- Last-used workspace (nullable until set)
  preferences     JSONB DEFAULT '{}',        -- Theme, notification settings, etc.
  created_at      TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX users_email_idx ON users(email);
```

**Why `id` is VARCHAR, not UUID**: It stores the Clerk user ID directly. This means
every `createdBy`, `deletedBy`, `approvedBy`, and `userId` column in the existing
schema can become a proper FK to `users.id`. No UUIDs to map.

#### `accounts`
The billing and organizational entity.

```sql
CREATE TABLE accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(255) NOT NULL UNIQUE,
  clerk_org_id    VARCHAR(255) UNIQUE,       -- Clerk Organization ID (nullable for migration)
  owner_id        VARCHAR(255) NOT NULL REFERENCES users(id),

  -- Billing
  billing_email   VARCHAR(255),
  billing_tier    VARCHAR(50) DEFAULT 'free' NOT NULL,  -- free, pro, team, enterprise

  -- Limits (enforced in application layer)
  max_workspaces        INT DEFAULT 1 NOT NULL,
  max_members           INT DEFAULT 1 NOT NULL,
  max_api_keys          INT DEFAULT 5 NOT NULL,
  max_baleybots_per_ws  INT DEFAULT 10 NOT NULL,
  max_executions_per_month INT,                          -- NULL = unlimited
  max_connections_per_ws INT DEFAULT 5 NOT NULL,

  -- Soft delete & versioning
  deleted_at      TIMESTAMP,
  deleted_by      VARCHAR(255) REFERENCES users(id),
  version         INT DEFAULT 1 NOT NULL,
  created_at      TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX accounts_owner_idx ON accounts(owner_id);
CREATE INDEX accounts_clerk_org_idx ON accounts(clerk_org_id);
CREATE INDEX accounts_deleted_at_idx ON accounts(deleted_at);
```

#### `account_members`
Maps users to accounts with account-level roles.

```sql
CREATE TABLE account_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id         VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            VARCHAR(50) NOT NULL DEFAULT 'member',
                  -- 'owner': Full control (billing, members, settings, delete account)
                  -- 'admin': Manage members, workspaces, settings (no billing/delete)
                  -- 'member': Access workspaces they're added to

  invited_by      VARCHAR(255) REFERENCES users(id),
  invited_at      TIMESTAMP,
  joined_at       TIMESTAMP DEFAULT NOW(),

  -- Soft delete (for leave/remove without losing history)
  deleted_at      TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMP DEFAULT NOW() NOT NULL,

  UNIQUE(account_id, user_id)
);

CREATE INDEX account_members_account_idx ON account_members(account_id);
CREATE INDEX account_members_user_idx ON account_members(user_id);
CREATE INDEX account_members_deleted_idx ON account_members(deleted_at);
```

#### `workspace_members`
Maps users to workspaces with workspace-level roles.

```sql
CREATE TABLE workspace_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id         VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            VARCHAR(50) NOT NULL DEFAULT 'editor',
                  -- 'admin':   Full workspace control (settings, members, connections, all CRUD)
                  -- 'editor':  Create/edit baleybots, tools, connections. Execute bots.
                  -- 'operator': Execute baleybots, view results. No create/edit.
                  -- 'viewer':  Read-only access to all workspace resources.

  added_by        VARCHAR(255) REFERENCES users(id),
  joined_at       TIMESTAMP DEFAULT NOW(),

  deleted_at      TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMP DEFAULT NOW() NOT NULL,

  UNIQUE(workspace_id, user_id)
);

CREATE INDEX workspace_members_workspace_idx ON workspace_members(workspace_id);
CREATE INDEX workspace_members_user_idx ON workspace_members(user_id);
CREATE INDEX workspace_members_deleted_idx ON workspace_members(deleted_at);
```

#### `account_api_keys`
System-level API keys scoped to an account. Different from existing workspace-scoped
`apiKeys` which remain for per-workspace programmatic access.

```sql
CREATE TABLE account_api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  key_hash        VARCHAR(64) NOT NULL,           -- SHA256 of the full key
  key_prefix      VARCHAR(20) NOT NULL,           -- "bui_acct_live_XXX" (first 16 chars)
  key_suffix      VARCHAR(4) NOT NULL,            -- Last 4 chars for display

  -- Permissions: which workspaces and what operations
  scope           JSONB NOT NULL DEFAULT '{"workspaces": "all", "permissions": ["read", "execute"]}',
  -- Examples:
  -- {"workspaces": "all", "permissions": ["read", "execute", "admin"]}
  -- {"workspaces": ["ws-uuid-1", "ws-uuid-2"], "permissions": ["read", "execute"]}

  last_used_at    TIMESTAMP,
  expires_at      TIMESTAMP,
  revoked_at      TIMESTAMP,

  created_by      VARCHAR(255) NOT NULL REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX account_api_keys_account_idx ON account_api_keys(account_id);
CREATE INDEX account_api_keys_hash_idx ON account_api_keys(key_hash);
```

#### `usage_records`
Tracks all billable activity. Rolled up per account for invoicing.

```sql
CREATE TABLE usage_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  workspace_id    UUID REFERENCES workspaces(id) ON DELETE SET NULL,

  -- What was consumed
  metric          VARCHAR(100) NOT NULL,
  -- Metrics:
  --   'bb_execution'        -- A baleybot execution (any trigger)
  --   'tokens_input'        -- LLM input tokens
  --   'tokens_output'       -- LLM output tokens
  --   'api_call'            -- An API request via account key
  --   'tool_execution'      -- A tool invocation
  --   'scheduled_task'      -- A scheduled task fire
  --   'webhook_received'    -- An inbound webhook
  --   'storage_bytes'       -- Memory/shared storage usage

  quantity        BIGINT NOT NULL,                -- Amount consumed
  unit_cost       DECIMAL(10, 6),                 -- Cost per unit (nullable, set at billing time)

  -- Attribution
  user_id         VARCHAR(255) REFERENCES users(id),
  api_key_id      UUID,                           -- Which API key (workspace or account level)
  baleybot_id     UUID,                           -- Which BB consumed this
  execution_id    UUID,                           -- Which execution

  -- Metadata
  metadata        JSONB DEFAULT '{}',             -- Model name, tool name, etc.

  -- Time bucketing
  recorded_at     TIMESTAMP DEFAULT NOW() NOT NULL,
  period_start    TIMESTAMP NOT NULL,             -- Start of billing period
  period_end      TIMESTAMP NOT NULL,             -- End of billing period

  created_at      TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX usage_records_account_idx ON usage_records(account_id);
CREATE INDEX usage_records_period_idx ON usage_records(account_id, period_start, period_end);
CREATE INDEX usage_records_metric_idx ON usage_records(account_id, metric, recorded_at);
CREATE INDEX usage_records_workspace_idx ON usage_records(workspace_id);
```

### Modified Tables

#### `workspaces` (modified)

```diff
 CREATE TABLE workspaces (
   id          UUID PRIMARY KEY,
   name        VARCHAR(255) NOT NULL,
   slug        VARCHAR(255) NOT NULL UNIQUE,
-  owner_id    VARCHAR(255) NOT NULL,
+  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
   deleted_at  TIMESTAMP,
-  deleted_by  VARCHAR(255),
+  deleted_by  VARCHAR(255) REFERENCES users(id),
   version     INT DEFAULT 1 NOT NULL,
   created_at  TIMESTAMP DEFAULT NOW() NOT NULL,
   updated_at  TIMESTAMP DEFAULT NOW() NOT NULL
 );

-CREATE INDEX workspaces_owner_idx ON workspaces(owner_id);
+CREATE INDEX workspaces_account_idx ON workspaces(account_id);
```

Key change: `ownerId` is replaced by `accountId`. Ownership is expressed through
`workspace_members` (role = 'admin') and `account_members` (role = 'owner').

#### `notifications` (modified)

Notifications remain per-user (a notification is for a specific person), but the
`userId` column gets a proper FK.

```diff
 CREATE TABLE notifications (
   ...
-  user_id     VARCHAR(255) NOT NULL,
+  user_id     VARCHAR(255) NOT NULL REFERENCES users(id),
   ...
 );
```

#### `baleybot_executions` (modified)

Add user attribution so we know who triggered each execution.

```diff
 CREATE TABLE baleybot_executions (
   ...
+  triggered_by_user_id VARCHAR(255) REFERENCES users(id),
+  triggered_by_api_key_id UUID,
   ...
 );
```

#### All `createdBy`/`deletedBy`/`approvedBy` columns

These become proper FKs to `users(id)`. No schema change needed for the column
definitions (they're already `VARCHAR(255)`), but we add FK constraints:

```sql
ALTER TABLE baleybots ADD CONSTRAINT fk_baleybots_created_by FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE baleybots ADD CONSTRAINT fk_baleybots_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id);
ALTER TABLE api_keys ADD CONSTRAINT fk_api_keys_created_by FOREIGN KEY (created_by) REFERENCES users(id);
-- ... etc for all tables with userId references
```

---

## 5. Clerk Integration Strategy

### Hybrid Approach

We use Clerk Organizations for what it does well (UI components, invitation flow,
member management) and our own tables for authorization and business logic.

```
Clerk (Identity Layer)              BaleyUI Database (Authorization Layer)
┌────────────────────┐              ┌─────────────────────────────────┐
│ Users              │──webhook──>  │ users (local mirror)            │
│ Organizations      │──webhook──>  │ accounts (+ account_members)    │
│ Org Memberships    │──webhook──>  │ account_members, workspace_members │
│ Org Invitations    │              │                                 │
│ Session Management │              │                                 │
└────────────────────┘              └─────────────────────────────────┘
         │                                        │
         │ auth()                                  │ DB queries
         │ returns userId, orgId                   │ return roles, permissions
         ▼                                        ▼
┌─────────────────────────────────────────────────────┐
│ Application Layer (tRPC, API routes, middleware)     │
│ - Clerk provides: WHO is this? (userId, orgId)      │
│ - Our DB provides: WHAT can they do? (roles, perms) │
└─────────────────────────────────────────────────────┘
```

### Webhook Events to Handle

| Clerk Event | BaleyUI Action |
|-------------|---------------|
| `user.created` | Insert into `users` table. Create personal account + workspace. |
| `user.updated` | Update `users` table (name, email, avatar). |
| `user.deleted` | Soft-delete user. Handle orphaned resources. |
| `organization.created` | Create `account` linked via `clerk_org_id`. |
| `organization.updated` | Update account name/slug. |
| `organization.deleted` | Soft-delete account and all workspaces. |
| `organizationMembership.created` | Insert `account_member`. Add to default workspace. |
| `organizationMembership.updated` | Update `account_member` role. |
| `organizationMembership.deleted` | Soft-delete `account_member` and `workspace_member` records. |

### Personal Accounts

When a user signs up without joining an organization, they get a **personal account**:
- Account name: "{firstName}'s Account"
- One workspace auto-created: "{firstName}'s Workspace"
- User is both account owner and workspace admin
- No Clerk Organization created (to avoid unnecessary Clerk costs)
- If they later invite someone, we create a Clerk Organization at that point

This avoids the Clerk MRO (Monthly Retained Organization) cost for solo users.

### Clerk UI Components Used

| Component | Where | Purpose |
|-----------|-------|---------|
| `<SignIn />` | `/sign-in` | Authentication |
| `<SignUp />` | `/sign-up` | Registration |
| `<UserButton />` | Sidebar | User menu, sign out |
| `<OrganizationSwitcher />` | Sidebar (new) | Switch between accounts |
| `<OrganizationProfile />` | Settings (new) | Manage members, invitations |

---

## 6. Authentication & Authorization

### Auth Context (Updated)

```typescript
type AuthContext = {
  db: Database;

  // Identity (from Clerk)
  userId: string | null;           // Clerk user ID
  clerkOrgId: string | null;       // Clerk Organization ID (null for personal accounts)

  // Authorization (from our DB)
  user: User | null;               // Local user record
  account: Account | null;         // Active account
  accountRole: AccountRole | null; // User's role in the account
  workspace: Workspace | null;     // Active workspace
  workspaceRole: WorkspaceRole | null; // User's role in the workspace

  // API key auth (alternative to session)
  authMethod: 'session' | 'workspace_api_key' | 'account_api_key' | null;
  apiKeyId: string | null;
  apiKeyPermissions: string[] | null;
};
```

### Procedure Types (Updated)

```typescript
// 1. Public - no auth required
const publicProcedure = t.procedure;

// 2. Authenticated - requires Clerk session, no workspace needed
//    Use for: account creation, workspace listing, onboarding
const authenticatedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: 'UNAUTHORIZED' });

  const user = await ctx.db.query.users.findFirst({
    where: eq(users.id, ctx.userId),
  });
  if (!user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User not found' });

  return next({ ctx: { ...ctx, user } });
});

// 3. Account-scoped - requires auth + active account
//    Use for: account settings, member management, billing
const accountProcedure = authenticatedProcedure.use(async ({ ctx, next }) => {
  const { account, role } = await resolveAccount(ctx);
  if (!account) throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found' });

  return next({ ctx: { ...ctx, account, accountRole: role } });
});

// 4. Workspace-scoped - requires auth + active account + active workspace
//    Use for: all resource CRUD (baleybots, connections, tools, etc.)
const workspaceProcedure = accountProcedure.use(async ({ ctx, next }) => {
  const { workspace, role } = await resolveWorkspace(ctx);
  if (!workspace) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' });

  return next({ ctx: { ...ctx, workspace, workspaceRole: role } });
});

// 5. Role-gated variants
const workspaceAdminProcedure = workspaceProcedure.use(requireWorkspaceRole('admin'));
const workspaceEditorProcedure = workspaceProcedure.use(requireWorkspaceRole('editor'));
const accountOwnerProcedure = accountProcedure.use(requireAccountRole('owner'));
```

### Workspace Resolution

The active workspace is determined by (in priority order):

1. **URL parameter**: `/dashboard/ws/:workspaceSlug/baleybots` (explicit)
2. **Session header**: `x-workspace-id` header (set by workspace switcher)
3. **User preference**: `users.default_workspace_id` (last-used workspace)
4. **First available**: First workspace the user has access to

```typescript
async function resolveWorkspace(ctx: AuthContext): Promise<{ workspace: Workspace; role: WorkspaceRole }> {
  // Find all workspaces user can access in the active account
  const membership = await ctx.db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.userId, ctx.user.id),
      eq(workspaceMembers.workspaceId, targetWorkspaceId),
      notDeleted(workspaceMembers),
    ),
    with: { workspace: true },
  });

  if (!membership || !membership.workspace || membership.workspace.deletedAt) {
    return { workspace: null, role: null };
  }

  // Verify workspace belongs to active account
  if (membership.workspace.accountId !== ctx.account.id) {
    return { workspace: null, role: null };
  }

  return { workspace: membership.workspace, role: membership.role };
}
```

### Role Permissions Matrix

#### Account Roles

| Permission | Owner | Admin | Member |
|-----------|-------|-------|--------|
| View account settings | Yes | Yes | No |
| Edit account settings | Yes | Yes | No |
| Manage billing | Yes | No | No |
| Invite members | Yes | Yes | No |
| Remove members | Yes | Yes | No |
| Create workspaces | Yes | Yes | No |
| Delete workspaces | Yes | Yes | No |
| Delete account | Yes | No | No |
| Transfer ownership | Yes | No | No |
| Create account API keys | Yes | Yes | No |
| Access workspaces | Via WS role | Via WS role | Via WS role |

#### Workspace Roles

| Permission | Admin | Editor | Operator | Viewer |
|-----------|-------|--------|----------|--------|
| Manage workspace settings | Yes | No | No | No |
| Manage workspace members | Yes | No | No | No |
| Manage connections | Yes | Yes | No | No |
| Create/edit baleybots | Yes | Yes | No | No |
| Delete baleybots | Yes | No | No | No |
| Execute baleybots | Yes | Yes | Yes | No |
| View executions | Yes | Yes | Yes | Yes |
| Approve tool requests | Yes | Yes | Yes | No |
| Manage policies | Yes | No | No | No |
| Create workspace API keys | Yes | No | No | No |
| View analytics | Yes | Yes | Yes | Yes |
| Manage scheduled tasks | Yes | Yes | No | No |

### Implementing Role Checks

```typescript
// Middleware factory
function requireWorkspaceRole(...allowedRoles: WorkspaceRole[]) {
  return async ({ ctx, next }) => {
    if (!allowedRoles.includes(ctx.workspaceRole)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
      });
    }
    return next({ ctx });
  };
}

// Usage in routers
const baleybotRouter = router({
  // Anyone with workspace access can list
  list: workspaceProcedure
    .query(async ({ ctx }) => { ... }),

  // Only editors and above can create
  create: workspaceEditorProcedure
    .input(createBaleybotSchema)
    .mutation(async ({ ctx }) => { ... }),

  // Only admins can delete
  delete: workspaceAdminProcedure
    .input(z.object({ id: uuidSchema }))
    .mutation(async ({ ctx }) => { ... }),

  // Operators and above can execute
  execute: workspaceProcedure
    .use(requireWorkspaceRole('admin', 'editor', 'operator'))
    .input(executeBaleybotSchema)
    .mutation(async ({ ctx }) => { ... }),
});
```

---

## 7. System API Keys & Consumption Billing

### API Key Hierarchy

```
Account API Keys (bui_acct_live_*)
├── Scope: Entire account or specific workspaces
├── Permissions: read, execute, admin
├── Usage tracked per key → rolled up to account
└── For: CI/CD, external integrations, programmatic access

Workspace API Keys (bui_live_*)  [existing]
├── Scope: Single workspace
├── Permissions: read, execute, admin
├── Usage tracked per key → rolled up to workspace → account
└── For: Per-workspace integrations, webhook auth
```

### Consumption Tracking

Every billable action writes a `usage_record`:

```typescript
async function trackUsage(params: {
  accountId: string;
  workspaceId?: string;
  metric: UsageMetric;
  quantity: number;
  userId?: string;
  apiKeyId?: string;
  baleybotId?: string;
  executionId?: string;
  metadata?: Record<string, unknown>;
}) {
  const period = getCurrentBillingPeriod(params.accountId);

  await db.insert(usageRecords).values({
    accountId: params.accountId,
    workspaceId: params.workspaceId,
    metric: params.metric,
    quantity: params.quantity,
    userId: params.userId,
    apiKeyId: params.apiKeyId,
    baleybotId: params.baleybotId,
    executionId: params.executionId,
    metadata: params.metadata ?? {},
    recordedAt: new Date(),
    periodStart: period.start,
    periodEnd: period.end,
  });
}
```

### Where Usage Is Tracked

| Event | Metric | Quantity | Where in Code |
|-------|--------|----------|---------------|
| BB execution starts | `bb_execution` | 1 | `executor.ts` on execution start |
| LLM API call completes | `tokens_input` | token count | `executor.ts` after LLM response |
| LLM API call completes | `tokens_output` | token count | `executor.ts` after LLM response |
| Tool invoked | `tool_execution` | 1 | `executor.ts` on tool call |
| API request via key | `api_call` | 1 | `validateApiKey` middleware |
| Scheduled task fires | `scheduled_task` | 1 | `process-scheduled-tasks` cron |
| Webhook received | `webhook_received` | 1 | Webhook route handler |

### Billing Period Queries

```typescript
// Get total usage for current billing period
async function getAccountUsageSummary(accountId: string) {
  const period = getCurrentBillingPeriod(accountId);

  const usage = await db
    .select({
      metric: usageRecords.metric,
      total: sql<number>`SUM(${usageRecords.quantity})`,
    })
    .from(usageRecords)
    .where(and(
      eq(usageRecords.accountId, accountId),
      gte(usageRecords.periodStart, period.start),
      lte(usageRecords.periodEnd, period.end),
    ))
    .groupBy(usageRecords.metric);

  return usage;
}

// Get usage breakdown by workspace
async function getUsageByWorkspace(accountId: string) {
  // ... similar query grouped by workspaceId
}

// Get usage breakdown by baleybot
async function getUsageByBaleybot(accountId: string, workspaceId: string) {
  // ... similar query grouped by baleybotId
}
```

### Limit Enforcement

```typescript
// Check before allowing an execution
async function checkExecutionAllowed(accountId: string): Promise<boolean> {
  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, accountId),
  });

  if (!account.maxExecutionsPerMonth) return true; // Unlimited

  const period = getCurrentBillingPeriod(accountId);
  const used = await db
    .select({ count: sql<number>`SUM(${usageRecords.quantity})` })
    .from(usageRecords)
    .where(and(
      eq(usageRecords.accountId, accountId),
      eq(usageRecords.metric, 'bb_execution'),
      gte(usageRecords.periodStart, period.start),
    ));

  return (used[0]?.count ?? 0) < account.maxExecutionsPerMonth;
}
```

---

## 8. Security Architecture

### Threat Model

| Threat | Mitigation |
|--------|-----------|
| User accesses workspace they don't belong to | Membership check in `workspaceProcedure` |
| User escalates their role | Roles stored in DB, not client-controllable |
| API key used for wrong workspace | Key scope checked against workspace |
| Cross-account data leakage | All queries scoped by workspace → account |
| Invitation link reuse | Token expiration, one-time use |
| CSRF on mutations | Origin/Referer validation in middleware |
| Stale session after removal | Webhook syncs membership changes immediately |
| Information leakage via error messages | `NOT_FOUND` instead of `FORBIDDEN` |

### Data Access Rules

```
Rule 1: A user can only access workspaces they are a member of.
         Membership is checked on EVERY request (not cached in session).

Rule 2: A workspace is only accessible if its parent account is active
         (not deleted, not suspended).

Rule 3: API keys can only access resources within their scope
         (workspace key → that workspace; account key → scoped workspaces).

Rule 4: Admin operations require explicit role checks, not just membership.

Rule 5: Account deletion cascades to all workspaces and memberships.
         Workspace deletion cascades to all resources.

Rule 6: Soft-deleted resources are invisible to all non-admin queries.
```

### Audit Trail

Every state-changing operation records:
- **Who**: `userId` or `apiKeyId`
- **What**: entity type, entity ID, action, changes
- **Where**: workspace ID, account ID
- **When**: timestamp
- **Context**: IP address, user agent, request ID

The existing `auditLogs` table handles this. The `userId` column gets a proper FK
to `users(id)`.

---

## 9. Onboarding & User Journey

### New User Flow

```
1. User visits / (landing page)
   └── Sees marketing page with "Get Started" CTA

2. Clicks "Get Started" → /sign-up
   └── Clerk SignUp component

3. Clerk creates user → fires user.created webhook
   └── Webhook handler:
       a. INSERT into users table (local mirror)
       b. INSERT into accounts table (personal account)
       c. INSERT into account_members (role: 'owner')
       d. INSERT into workspaces (name: "{name}'s Workspace")
       e. INSERT into workspace_members (role: 'admin')

4. Clerk redirects to /onboarding
   └── Onboarding page:
       Step 1: Welcome + feature overview
       Step 2: Confirm/rename workspace (pre-filled, already created)
       Step 3: Quick-start guide (connect a provider, create first BB)

5. Redirects to /dashboard/{workspace-slug}/baleybots
   └── User sees empty state with guided creation prompt
```

### Invited User Flow

```
1. Existing user sends invitation (via OrganizationProfile or custom UI)
   └── Clerk sends invitation email

2. Invitee clicks link → /sign-up (or /sign-in if existing)
   └── Clerk handles auth

3. Clerk fires organizationMembership.created webhook
   └── Webhook handler:
       a. Ensure user exists in users table (create if needed)
       b. INSERT into account_members (role from Clerk)
       c. INSERT into workspace_members for default workspace

4. User lands on /dashboard
   └── Sees the shared workspace they were invited to
```

### Workspace Switching

```
Sidebar shows:
┌──────────────────────────┐
│ ▾ Acme Corp              │  ← Account switcher (OrganizationSwitcher)
│   ┌────────────────────┐ │
│   │ ▾ Production       │ │  ← Workspace switcher (custom component)
│   │   ○ Staging        │ │
│   │   ○ Experiments    │ │
│   └────────────────────┘ │
│                          │
│ 📦 BaleyBots             │
│ 🔗 Connections           │
│ 🔧 Tools                 │
│ 📊 Analytics             │
│ ⚙️ Settings              │
└──────────────────────────┘
```

When switching workspace:
1. Update `users.default_workspace_id`
2. Navigate to `/dashboard/{new-workspace-slug}/baleybots`
3. All subsequent queries use the new workspace context

---

## 10. Migration Strategy

### Phase 1: Foundation (Non-Breaking)

Add new tables without changing existing behavior.

1. **Create `users` table**. Backfill from Clerk API for all existing `ownerId` values.
2. **Create `accounts` table**. For each existing workspace, create a personal account.
3. **Create `account_members` table**. For each account, add the owner.
4. **Create `workspace_members` table**. For each workspace, add the owner as admin.
5. **Add `account_id` column to `workspaces`** (nullable initially). Backfill from accounts.
6. **Update Clerk webhook** to handle `user.created` with new table inserts.

At this point, old code still works (reads `ownerId`), new code can start using
the membership tables.

### Phase 2: Auth Migration (Core Change)

Switch the auth layer to use membership tables.

1. **Update `protectedProcedure`** (now `workspaceProcedure`) to check
   `workspace_members` instead of `workspaces.ownerId`.
2. **Update `resolveWorkspace`** to use membership lookup.
3. **Add workspace selection** to the auth context (header or URL-based).
4. **Update `WorkspaceGuard`** to check membership, not ownership.
5. **Fix the onboarding loop bug** (invalidate cache after creation).
6. **Update all 109+ procedures** to use new procedure types. (Most are already
   `protectedProcedure` and just need renaming to `workspaceProcedure`.)

### Phase 3: Multi-User Features

Build the team collaboration features.

1. **Add Clerk Organizations** config to ClerkProvider.
2. **Add `<OrganizationSwitcher />`** to sidebar.
3. **Add workspace switcher** component (custom, since Clerk doesn't know about
   our workspace concept).
4. **Build member management UI** for workspace settings.
5. **Handle all Clerk Organization webhooks**.
6. **Add role-based UI** (hide create/edit buttons for viewers, etc.).

### Phase 4: Billing & Usage

Build the consumption tracking and billing infrastructure.

1. **Create `usage_records` table**.
2. **Create `account_api_keys` table**.
3. **Add usage tracking** to executor, API validation, webhook handler.
4. **Build usage dashboard** in account settings.
5. **Add limit enforcement** before billable operations.
6. **Integrate payment processor** (future - not in this plan).

### Phase 5: Cleanup

Remove legacy patterns.

1. **Make `workspaces.account_id` NOT NULL** (after backfill verified).
2. **Drop `workspaces.owner_id` column**.
3. **Add FK constraints** to all `createdBy`/`deletedBy`/`approvedBy` columns.
4. **Remove single-workspace-per-user enforcement** from workspaces router.
5. **Update onboarding** to handle team-invite vs personal-signup flows.

---

## 11. Testing Strategy

### Testing with Two Users in Same Account

To test multi-user access with Clerk:

1. **Create two Clerk test users** in the Clerk dashboard (or via API):
   - User A: `test-owner@example.com`
   - User B: `test-member@example.com`

2. **Sign in as User A** → creates personal account + workspace automatically.

3. **From User A's account settings**, invite User B:
   - If using Clerk Organizations: Use `<OrganizationProfile />` invite UI
   - If using custom UI: Call `workspaces.addMember` mutation

4. **Sign in as User B** (separate browser/incognito):
   - Should see User A's workspace in their workspace list
   - Should have the role assigned during invitation

5. **Verify isolation**:
   - User B can see baleybots in the shared workspace
   - User B cannot see User A's personal workspace (if separate)
   - User B's actions show their userId in audit logs
   - Role restrictions work (viewer can't edit, operator can't create)

### Clerk Test Environment

Clerk provides separate development and production instances. In development:
- Use `pk_test_*` and `sk_test_*` keys
- Email verification can be bypassed
- Users can be created instantly via dashboard
- Webhooks can be tested via Clerk's webhook testing UI or ngrok

### Automated Tests

```typescript
// Example: Multi-user workspace access test
describe('workspace access', () => {
  it('allows member to list baleybots', async () => {
    const { workspace, ownerCtx, memberCtx } = await setupMultiUserWorkspace();

    // Owner creates a baleybot
    await caller(ownerCtx).baleybots.create({ name: 'Test BB', ... });

    // Member can list it
    const bots = await caller(memberCtx).baleybots.list();
    expect(bots).toHaveLength(1);
    expect(bots[0].name).toBe('Test BB');
  });

  it('prevents viewer from creating baleybots', async () => {
    const { viewerCtx } = await setupMultiUserWorkspace({ viewerRole: 'viewer' });

    await expect(
      caller(viewerCtx).baleybots.create({ name: 'Test BB', ... })
    ).rejects.toThrow('Insufficient permissions');
  });

  it('prevents cross-workspace access', async () => {
    const { workspace1MemberCtx, workspace2 } = await setupTwoWorkspaces();

    // User in workspace1 cannot access workspace2's bots
    const bots = await caller(workspace1MemberCtx).baleybots.list();
    expect(bots.every(b => b.workspaceId !== workspace2.id)).toBe(true);
  });
});
```

---

## Appendix A: Billing Tiers (Proposed)

| Feature | Free | Pro | Team | Enterprise |
|---------|------|-----|------|-----------|
| Price | $0 | $X/mo | $Y/mo | Custom |
| Users per account | 1 | 1 | Up to N | Unlimited |
| Workspaces | 1 | 3 | 10 | Unlimited |
| Baleybots per workspace | 5 | 25 | 100 | Unlimited |
| Connections per workspace | 3 | 10 | 25 | Unlimited |
| BB executions/month | 100 | 5,000 | 50,000 | Custom |
| API keys | 2 | 10 | 50 | Unlimited |
| Scheduled tasks | 5 | 25 | 100 | Unlimited |
| Roles | owner only | owner only | Full RBAC | Full RBAC + custom |
| Audit log retention | 7 days | 30 days | 90 days | 1 year |
| Support | Community | Email | Priority | Dedicated |

(Pricing TBD - this is the feature structure, not the dollar amounts.)

## Appendix B: URL Structure

```
/                                    -- Landing page (public)
/sign-in                             -- Clerk sign in
/sign-up                             -- Clerk sign up
/onboarding                          -- New user onboarding

/dashboard                           -- Redirects to default workspace
/dashboard/:workspaceSlug            -- Workspace home (redirects to baleybots)
/dashboard/:workspaceSlug/baleybots  -- BaleyBot list
/dashboard/:workspaceSlug/baleybots/:id -- BaleyBot detail
/dashboard/:workspaceSlug/connections -- Connections
/dashboard/:workspaceSlug/tools      -- Tools
/dashboard/:workspaceSlug/analytics  -- Analytics
/dashboard/:workspaceSlug/settings   -- Workspace settings
/dashboard/:workspaceSlug/settings/members -- Member management

/account                             -- Account settings
/account/members                     -- Account member management
/account/billing                     -- Usage & billing
/account/api-keys                    -- Account-level API keys
```

## Appendix C: Migration Checklist

### Files Requiring Changes

**Schema & Database:**
- [ ] `packages/db/src/schema.ts` - New tables, modified workspaces
- [ ] Migration files - Generated via drizzle-kit

**Auth Layer:**
- [ ] `apps/web/src/lib/trpc/trpc.ts` - New procedure types, workspace resolution
- [ ] `apps/web/src/lib/auth/index.ts` - Updated getCurrentAuth
- [ ] `apps/web/src/lib/auth/workspace-lookup.ts` - Membership-based lookup
- [ ] `apps/web/src/lib/api/validate-api-key.ts` - Account API key support
- [ ] `apps/web/src/middleware.ts` - Org sync, workspace slug routing

**Webhook:**
- [ ] `apps/web/src/app/api/webhooks/clerk/route.ts` - All new event types

**tRPC Routers (procedure type updates):**
- [ ] `baleybots.ts` - workspaceProcedure + role checks
- [ ] `connections.ts`
- [ ] `triggers.ts`
- [ ] `memory.ts`
- [ ] `tools.ts`
- [ ] `notifications.ts`
- [ ] `scheduled-tasks.ts`
- [ ] `policies.ts`
- [ ] `api-keys.ts`
- [ ] `webhooks.ts`
- [ ] `analytics.ts`
- [ ] `workspaces.ts` - Major rewrite (CRUD, members, switcher)
- [ ] New: `accounts.ts` - Account CRUD, member management
- [ ] New: `usage.ts` - Usage queries

**Components:**
- [ ] `WorkspaceGuard.tsx` - Membership check + cache fix
- [ ] `sidebar.tsx` - Account switcher, workspace switcher
- [ ] New: Workspace switcher component
- [ ] New: Member management UI
- [ ] New: Usage dashboard

**Pages:**
- [ ] `onboarding/page.tsx` - Updated flow
- [ ] `dashboard/` routes - Workspace slug in URL
- [ ] New: `/account/` routes

**Services:**
- [ ] `notification-service.ts` - Use ctx.user.id properly
- [ ] `schedule-service.ts` - Attribution tracking
- [ ] `executor.ts` - Usage tracking
- [ ] `audit/middleware.ts` - Enhanced context
