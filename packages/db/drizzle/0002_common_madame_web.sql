CREATE TABLE "companion_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"messages" jsonb NOT NULL,
	"actions_taken" jsonb DEFAULT '[]'::jsonb,
	"page_context" varchar(255),
	"execution_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"stripe_price_id" varchar(100),
	"limits" jsonb NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"plan_id" varchar(50) NOT NULL,
	"stripe_customer_id" varchar(100),
	"stripe_subscription_id" varchar(100),
	"status" varchar(20) NOT NULL,
	"current_period_start" timestamp NOT NULL,
	"current_period_end" timestamp NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_workspace_id_unique" UNIQUE("workspace_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"avatar_url" varchar(2000),
	"preferences" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" varchar(50) DEFAULT 'editor' NOT NULL,
	"token" varchar(255) NOT NULL,
	"invited_by" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"role" varchar(50) DEFAULT 'editor' NOT NULL,
	"added_by" varchar(255),
	"joined_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "baleybot_executions" ADD COLUMN "idempotency_key" varchar(255);--> statement-breakpoint
ALTER TABLE "baleybots" ADD COLUMN "admin_edited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "baleybots" ADD COLUMN "lifecycle_stage" varchar(50) DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "baleybots" ADD COLUMN "launch_kit" jsonb;--> statement-breakpoint
ALTER TABLE "baleybots" ADD COLUMN "runtime_interface_spec" jsonb;--> statement-breakpoint
ALTER TABLE "baleybots" ADD COLUMN "launch_prepared_at" timestamp;--> statement-breakpoint
ALTER TABLE "baleybots" ADD COLUMN "live_at" timestamp;--> statement-breakpoint
ALTER TABLE "baleybots" ADD COLUMN "paused_at" timestamp;--> statement-breakpoint
ALTER TABLE "baleybots" ADD COLUMN "test_cases_json" jsonb;--> statement-breakpoint
ALTER TABLE "companion_conversations" ADD CONSTRAINT "companion_conversations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companion_conversations_workspace_idx" ON "companion_conversations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "companion_conversations_user_idx" ON "companion_conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "companion_conversations_created_idx" ON "companion_conversations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "subscriptions_workspace_idx" ON "subscriptions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "subscriptions_plan_idx" ON "subscriptions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriptions_stripe_customer_idx" ON "subscriptions" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "ws_invite_unique" ON "workspace_invitations" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE INDEX "workspace_invitations_workspace_idx" ON "workspace_invitations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_invitations_token_idx" ON "workspace_invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "workspace_invitations_status_idx" ON "workspace_invitations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "ws_member_unique" ON "workspace_members" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "workspace_members_workspace_idx" ON "workspace_members" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_members_user_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workspace_members_deleted_idx" ON "workspace_members" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "api_keys_workspace_id_idx" ON "api_keys" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "api_keys_key_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_revoked_at_idx" ON "api_keys" USING btree ("revoked_at");--> statement-breakpoint
CREATE INDEX "api_keys_workspace_revoked_idx" ON "api_keys" USING btree ("workspace_id","revoked_at");--> statement-breakpoint
CREATE INDEX "baleybot_executions_baleybot_status_idx" ON "baleybot_executions" USING btree ("baleybot_id","status");--> statement-breakpoint
CREATE INDEX "bb_exec_bot_created_idx" ON "baleybot_executions" USING btree ("baleybot_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bb_exec_idempotency_idx" ON "baleybot_executions" USING btree ("baleybot_id","idempotency_key") WHERE "baleybot_executions"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "baleybots_lifecycle_stage_idx" ON "baleybots" USING btree ("lifecycle_stage");--> statement-breakpoint
CREATE INDEX "baleybots_deleted_at_idx" ON "baleybots" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "block_executions_block_id_idx" ON "block_executions" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "block_executions_flow_execution_id_idx" ON "block_executions" USING btree ("flow_execution_id");--> statement-breakpoint
CREATE INDEX "block_executions_status_idx" ON "block_executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "block_executions_created_at_idx" ON "block_executions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "block_exec_flow_created_idx" ON "block_executions" USING btree ("flow_execution_id","created_at");--> statement-breakpoint
CREATE INDEX "blocks_workspace_id_idx" ON "blocks" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "blocks_type_idx" ON "blocks" USING btree ("type");--> statement-breakpoint
CREATE INDEX "blocks_connection_id_idx" ON "blocks" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "blocks_deleted_at_idx" ON "blocks" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "connections_workspace_id_idx" ON "connections" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "connections_type_idx" ON "connections" USING btree ("type");--> statement-breakpoint
CREATE INDEX "connections_status_idx" ON "connections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "connections_deleted_at_idx" ON "connections" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "decisions_created_id_idx" ON "decisions" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "execution_events_type_idx" ON "execution_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "flow_executions_flow_id_idx" ON "flow_executions" USING btree ("flow_id");--> statement-breakpoint
CREATE INDEX "flow_executions_status_idx" ON "flow_executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "flow_executions_created_at_idx" ON "flow_executions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "flows_workspace_id_idx" ON "flows" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "flows_enabled_idx" ON "flows" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "flows_deleted_at_idx" ON "flows" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "patterns_block_id_idx" ON "patterns" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "patterns_pattern_type_idx" ON "patterns" USING btree ("pattern_type");--> statement-breakpoint
CREATE INDEX "test_cases_block_id_idx" ON "test_cases" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "tool_executions_block_execution_id_idx" ON "tool_executions" USING btree ("block_execution_id");--> statement-breakpoint
CREATE INDEX "tool_executions_tool_id_idx" ON "tool_executions" USING btree ("tool_id");--> statement-breakpoint
CREATE INDEX "tool_executions_approval_status_idx" ON "tool_executions" USING btree ("approval_status");--> statement-breakpoint
CREATE INDEX "tool_executions_created_at_idx" ON "tool_executions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tools_workspace_id_idx" ON "tools" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "tools_connection_id_idx" ON "tools" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "tools_deleted_at_idx" ON "tools" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "workspace_policies_workspace_id_idx" ON "workspace_policies" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspaces_owner_id_idx" ON "workspaces" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "workspaces_deleted_at_idx" ON "workspaces" USING btree ("deleted_at");