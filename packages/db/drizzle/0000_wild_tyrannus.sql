CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"key_prefix" varchar(20) NOT NULL,
	"key_suffix" varchar(4) NOT NULL,
	"permissions" jsonb NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_by" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_patterns" (
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
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" varchar(50) NOT NULL,
	"user_id" varchar(255),
	"workspace_id" uuid,
	"changes" jsonb,
	"previous_values" jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"request_id" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "background_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(100) NOT NULL,
	"data" jsonb NOT NULL,
	"status" varchar(50) DEFAULT 'pending',
	"priority" integer DEFAULT 0,
	"attempts" integer DEFAULT 0,
	"max_attempts" integer DEFAULT 3,
	"last_error" text,
	"locked_by" varchar(100),
	"locked_at" timestamp,
	"scheduled_for" timestamp DEFAULT now(),
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "baleybot_executions" (
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
--> statement-breakpoint
CREATE TABLE "baleybots" (
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
--> statement-breakpoint
CREATE TABLE "block_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_id" uuid NOT NULL,
	"flow_execution_id" uuid,
	"baleybot_id" varchar(100),
	"parent_baleybot_id" varchar(100),
	"status" varchar(50) NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error" text,
	"model" varchar(255),
	"tokens_input" integer,
	"tokens_output" integer,
	"reasoning" text,
	"execution_path" varchar(20),
	"fallback_reason" text,
	"pattern_matched" text,
	"match_confidence" numeric(5, 2),
	"stream_events" jsonb DEFAULT '[]'::jsonb,
	"heartbeat_at" timestamp,
	"heartbeat_interval_ms" integer DEFAULT 5000,
	"server_id" varchar(100),
	"server_started_at" timestamp,
	"attempt_number" integer DEFAULT 1,
	"max_attempts" integer DEFAULT 3,
	"event_count" integer DEFAULT 0,
	"last_event_index" integer DEFAULT -1,
	"started_at" timestamp,
	"completed_at" timestamp,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"input_schema" jsonb DEFAULT '{}'::jsonb,
	"output_schema" jsonb DEFAULT '{}'::jsonb,
	"connection_id" uuid,
	"model" varchar(255),
	"goal" text,
	"system_prompt" text,
	"temperature" numeric(3, 2),
	"max_tokens" integer,
	"max_tool_iterations" integer DEFAULT 25,
	"code" text,
	"router_config" jsonb,
	"loop_config" jsonb,
	"tool_ids" jsonb DEFAULT '[]'::jsonb,
	"execution_mode" varchar(50) DEFAULT 'ai_only',
	"generated_code" text,
	"code_generated_at" timestamp,
	"code_accuracy" numeric(5, 2),
	"hybrid_threshold" numeric(5, 2) DEFAULT '80.00',
	"execution_count" integer DEFAULT 0,
	"avg_latency_ms" integer,
	"last_executed_at" timestamp,
	"deleted_at" timestamp,
	"deleted_by" varchar(255),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"config" jsonb NOT NULL,
	"is_default" boolean DEFAULT false,
	"status" varchar(50) DEFAULT 'unconfigured',
	"available_models" jsonb,
	"last_checked_at" timestamp,
	"deleted_at" timestamp,
	"deleted_by" varchar(255),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_id" uuid NOT NULL,
	"block_execution_id" uuid NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb NOT NULL,
	"reasoning" text,
	"model" varchar(255),
	"tokens_input" integer,
	"tokens_output" integer,
	"latency_ms" integer,
	"cost" numeric(10, 6),
	"feedback_correct" boolean,
	"feedback_category" varchar(50),
	"feedback_notes" text,
	"feedback_corrected_output" jsonb,
	"feedback_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execution_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"event_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flow_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" uuid NOT NULL,
	"flow_version" integer NOT NULL,
	"triggered_by" jsonb NOT NULL,
	"status" varchar(50) NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error" jsonb,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"nodes" jsonb DEFAULT '[]'::jsonb,
	"edges" jsonb DEFAULT '[]'::jsonb,
	"triggers" jsonb DEFAULT '[]'::jsonb,
	"enabled" boolean DEFAULT false,
	"deleted_at" timestamp,
	"deleted_by" varchar(255),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_id" uuid NOT NULL,
	"rule" text NOT NULL,
	"condition" jsonb NOT NULL,
	"output_template" jsonb,
	"confidence" numeric(5, 4),
	"support_count" integer,
	"samples" jsonb DEFAULT '[]'::jsonb,
	"pattern_type" varchar(50),
	"generated_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"input" jsonb NOT NULL,
	"expected_output" jsonb,
	"assertions" jsonb DEFAULT '[]'::jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_execution_id" uuid NOT NULL,
	"tool_id" uuid,
	"tool_call_id" varchar(100),
	"tool_name" varchar(255) NOT NULL,
	"arguments" jsonb,
	"result" jsonb,
	"error" text,
	"requires_approval" boolean DEFAULT false,
	"approval_status" varchar(50),
	"approval_decision" jsonb,
	"approved_at" timestamp,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"input_schema" jsonb NOT NULL,
	"code" text NOT NULL,
	"connection_id" uuid,
	"is_generated" boolean DEFAULT false,
	"deleted_at" timestamp,
	"deleted_by" varchar(255),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" uuid NOT NULL,
	"webhook_secret" varchar(100) NOT NULL,
	"method" varchar(10) NOT NULL,
	"headers" jsonb,
	"body" jsonb,
	"query" jsonb,
	"status" varchar(50) NOT NULL,
	"status_code" integer NOT NULL,
	"execution_id" uuid,
	"error" text,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_policies" (
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
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"owner_id" varchar(255) NOT NULL,
	"deleted_at" timestamp,
	"deleted_by" varchar(255),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_patterns" ADD CONSTRAINT "approval_patterns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baleybot_executions" ADD CONSTRAINT "baleybot_executions_baleybot_id_baleybots_id_fk" FOREIGN KEY ("baleybot_id") REFERENCES "public"."baleybots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baleybots" ADD CONSTRAINT "baleybots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_executions" ADD CONSTRAINT "block_executions_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_executions" ADD CONSTRAINT "block_executions_flow_execution_id_flow_executions_id_fk" FOREIGN KEY ("flow_execution_id") REFERENCES "public"."flow_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_block_execution_id_block_executions_id_fk" FOREIGN KEY ("block_execution_id") REFERENCES "public"."block_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_events" ADD CONSTRAINT "execution_events_execution_id_block_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."block_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_executions" ADD CONSTRAINT "flow_executions_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flows" ADD CONSTRAINT "flows_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patterns" ADD CONSTRAINT "patterns_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_block_execution_id_block_executions_id_fk" FOREIGN KEY ("block_execution_id") REFERENCES "public"."block_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_tool_id_tools_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_execution_id_flow_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."flow_executions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_policies" ADD CONSTRAINT "workspace_policies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_patterns_workspace_idx" ON "approval_patterns" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "approval_patterns_tool_idx" ON "approval_patterns" USING btree ("tool");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_user_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_time_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "job_status_priority_idx" ON "background_jobs" USING btree ("status","priority");--> statement-breakpoint
CREATE INDEX "job_scheduled_idx" ON "background_jobs" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "baleybot_executions_baleybot_idx" ON "baleybot_executions" USING btree ("baleybot_id");--> statement-breakpoint
CREATE INDEX "baleybot_executions_status_idx" ON "baleybot_executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "baleybot_executions_created_idx" ON "baleybot_executions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "baleybots_workspace_idx" ON "baleybots" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "baleybots_status_idx" ON "baleybots" USING btree ("status");--> statement-breakpoint
CREATE INDEX "decisions_block_idx" ON "decisions" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "decisions_created_idx" ON "decisions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "decisions_model_idx" ON "decisions" USING btree ("model");--> statement-breakpoint
CREATE UNIQUE INDEX "execution_event_idx" ON "execution_events" USING btree ("execution_id","index");--> statement-breakpoint
CREATE INDEX "webhook_logs_flow_idx" ON "webhook_logs" USING btree ("flow_id");--> statement-breakpoint
CREATE INDEX "webhook_logs_created_idx" ON "webhook_logs" USING btree ("created_at");