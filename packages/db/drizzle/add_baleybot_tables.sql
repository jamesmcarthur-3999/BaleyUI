-- Add BaleyBot tables for BAL-first architecture
-- Migration: add_baleybot_tables
-- Date: 2026-02-02

-- Create baleybots table
CREATE TABLE IF NOT EXISTS "baleybots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"icon" varchar(100),
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"bal_code" text NOT NULL,
	"structure" jsonb,
	"entity_names" jsonb,
	"dependencies" jsonb,
	"execution_count" integer DEFAULT 0,
	"last_executed_at" timestamp,
	"created_by" varchar(255),
	"deleted_at" timestamp,
	"deleted_by" varchar(255),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create baleybot_executions table
CREATE TABLE IF NOT EXISTS "baleybot_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"baleybot_id" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error" text,
	"segments" jsonb,
	"started_at" timestamp,
	"completed_at" timestamp,
	"duration_ms" integer,
	"token_count" integer,
	"triggered_by" varchar(50),
	"trigger_source" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- Create approval_patterns table
CREATE TABLE IF NOT EXISTS "approval_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"tool" varchar(255) NOT NULL,
	"action_pattern" jsonb NOT NULL,
	"entity_goal_pattern" text,
	"trust_level" varchar(50) DEFAULT 'provisional' NOT NULL,
	"times_used" integer DEFAULT 0 NOT NULL,
	"approved_by" varchar(255),
	"approved_at" timestamp,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"revoked_by" varchar(255),
	"revoke_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create workspace_policies table
CREATE TABLE IF NOT EXISTS "workspace_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"allowed_tools" jsonb,
	"forbidden_tools" jsonb,
	"requires_approval_tools" jsonb,
	"max_auto_approve_amount" integer,
	"reapproval_interval_days" integer DEFAULT 90,
	"max_auto_fires_before_review" integer DEFAULT 100,
	"learning_manual" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_policies_workspace_id_unique" UNIQUE("workspace_id")
);

-- Add foreign keys
ALTER TABLE "baleybots" ADD CONSTRAINT "baleybots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "baleybot_executions" ADD CONSTRAINT "baleybot_executions_baleybot_id_baleybots_id_fk" FOREIGN KEY ("baleybot_id") REFERENCES "public"."baleybots"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "approval_patterns" ADD CONSTRAINT "approval_patterns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "workspace_policies" ADD CONSTRAINT "workspace_policies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

-- Add indexes
CREATE INDEX IF NOT EXISTS "baleybots_workspace_idx" ON "baleybots" USING btree ("workspace_id");
CREATE INDEX IF NOT EXISTS "baleybots_status_idx" ON "baleybots" USING btree ("status");
CREATE INDEX IF NOT EXISTS "baleybot_executions_baleybot_idx" ON "baleybot_executions" USING btree ("baleybot_id");
CREATE INDEX IF NOT EXISTS "baleybot_executions_status_idx" ON "baleybot_executions" USING btree ("status");
CREATE INDEX IF NOT EXISTS "baleybot_executions_created_idx" ON "baleybot_executions" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "approval_patterns_workspace_idx" ON "approval_patterns" USING btree ("workspace_id");
CREATE INDEX IF NOT EXISTS "approval_patterns_tool_idx" ON "approval_patterns" USING btree ("tool");
