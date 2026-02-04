CREATE TABLE "baleybot_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"baleybot_id" uuid NOT NULL,
	"alert_condition" varchar(500) NOT NULL,
	"triggered_value" double precision,
	"threshold_value" double precision,
	"metric_name" varchar(255),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"severity" varchar(20) DEFAULT 'warning' NOT NULL,
	"triggered_at" timestamp DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp,
	"acknowledged_by" varchar(255),
	"resolved_at" timestamp,
	"resolved_by" varchar(255),
	"message" text,
	"context" jsonb
);
--> statement-breakpoint
CREATE TABLE "baleybot_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"baleybot_id" uuid NOT NULL,
	"key" varchar(255) NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "baleybot_metric_aggregates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"baleybot_id" uuid NOT NULL,
	"metric_name" varchar(255) NOT NULL,
	"period" varchar(20) NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"value" double precision,
	"min_value" double precision,
	"max_value" double precision,
	"sum_value" double precision,
	"sample_count" integer NOT NULL,
	"previous_period_value" double precision,
	"change_percent" double precision,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "baleybot_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"baleybot_id" uuid NOT NULL,
	"execution_id" uuid,
	"metric_name" varchar(255) NOT NULL,
	"metric_type" varchar(50) NOT NULL,
	"value" double precision,
	"dimensions" jsonb,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "baleybot_shared_storage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key" varchar(255) NOT NULL,
	"value" jsonb NOT NULL,
	"producer_id" uuid,
	"execution_id" uuid,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "baleybot_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_baleybot_id" uuid NOT NULL,
	"target_baleybot_id" uuid NOT NULL,
	"trigger_type" varchar(50) NOT NULL,
	"enabled" boolean DEFAULT true,
	"input_mapping" jsonb,
	"static_input" jsonb,
	"condition" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "baleybot_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"baleybot_id" uuid NOT NULL,
	"execution_id" uuid,
	"token_input" integer DEFAULT 0,
	"token_output" integer DEFAULT 0,
	"token_total" integer DEFAULT 0,
	"api_calls" integer DEFAULT 0,
	"tool_calls" integer DEFAULT 0,
	"duration_ms" integer,
	"estimated_cost" double precision,
	"model" varchar(255),
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "builder_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(50) NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor" jsonb NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"entity_type" varchar(50),
	"entity_id" uuid,
	"sequence_number" integer GENERATED ALWAYS AS IDENTITY (sequence name "builder_events_sequence_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"priority" varchar(20) DEFAULT 'normal' NOT NULL,
	"source_type" varchar(50),
	"source_id" uuid,
	"execution_id" uuid,
	"read_at" timestamp,
	"dismissed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"baleybot_id" uuid NOT NULL,
	"run_at" timestamp NOT NULL,
	"cron_expression" varchar(100),
	"input" jsonb,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"last_run_at" timestamp,
	"last_run_status" varchar(50),
	"last_run_error" text,
	"execution_id" uuid,
	"run_count" integer DEFAULT 0,
	"max_runs" integer,
	"approved_by" varchar(255),
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blocks" DROP CONSTRAINT "blocks_connection_id_connections_id_fk";
--> statement-breakpoint
ALTER TABLE "tool_executions" DROP CONSTRAINT "tool_executions_tool_id_tools_id_fk";
--> statement-breakpoint
ALTER TABLE "tools" DROP CONSTRAINT "tools_connection_id_connections_id_fk";
--> statement-breakpoint
ALTER TABLE "webhook_logs" DROP CONSTRAINT "webhook_logs_execution_id_flow_executions_id_fk";
--> statement-breakpoint
ALTER TABLE "baleybots" ADD COLUMN "is_internal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "baleybots" ADD COLUMN "webhook_secret" varchar(100);--> statement-breakpoint
ALTER TABLE "baleybots" ADD COLUMN "webhook_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "baleybots" ADD COLUMN "conversation_history" jsonb;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "is_operational" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "workspace_policies" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "baleybot_alerts" ADD CONSTRAINT "baleybot_alerts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baleybot_alerts" ADD CONSTRAINT "baleybot_alerts_baleybot_id_baleybots_id_fk" FOREIGN KEY ("baleybot_id") REFERENCES "public"."baleybots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baleybot_memory" ADD CONSTRAINT "baleybot_memory_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baleybot_memory" ADD CONSTRAINT "baleybot_memory_baleybot_id_baleybots_id_fk" FOREIGN KEY ("baleybot_id") REFERENCES "public"."baleybots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baleybot_metric_aggregates" ADD CONSTRAINT "baleybot_metric_aggregates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baleybot_metric_aggregates" ADD CONSTRAINT "baleybot_metric_aggregates_baleybot_id_baleybots_id_fk" FOREIGN KEY ("baleybot_id") REFERENCES "public"."baleybots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baleybot_metrics" ADD CONSTRAINT "baleybot_metrics_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baleybot_metrics" ADD CONSTRAINT "baleybot_metrics_baleybot_id_baleybots_id_fk" FOREIGN KEY ("baleybot_id") REFERENCES "public"."baleybots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baleybot_metrics" ADD CONSTRAINT "baleybot_metrics_execution_id_baleybot_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."baleybot_executions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baleybot_shared_storage" ADD CONSTRAINT "baleybot_shared_storage_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baleybot_shared_storage" ADD CONSTRAINT "baleybot_shared_storage_producer_id_baleybots_id_fk" FOREIGN KEY ("producer_id") REFERENCES "public"."baleybots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baleybot_shared_storage" ADD CONSTRAINT "baleybot_shared_storage_execution_id_baleybot_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."baleybot_executions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baleybot_triggers" ADD CONSTRAINT "baleybot_triggers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baleybot_triggers" ADD CONSTRAINT "baleybot_triggers_source_baleybot_id_baleybots_id_fk" FOREIGN KEY ("source_baleybot_id") REFERENCES "public"."baleybots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baleybot_triggers" ADD CONSTRAINT "baleybot_triggers_target_baleybot_id_baleybots_id_fk" FOREIGN KEY ("target_baleybot_id") REFERENCES "public"."baleybots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baleybot_usage" ADD CONSTRAINT "baleybot_usage_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baleybot_usage" ADD CONSTRAINT "baleybot_usage_baleybot_id_baleybots_id_fk" FOREIGN KEY ("baleybot_id") REFERENCES "public"."baleybots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baleybot_usage" ADD CONSTRAINT "baleybot_usage_execution_id_baleybot_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."baleybot_executions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "builder_events" ADD CONSTRAINT "builder_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_baleybot_id_baleybots_id_fk" FOREIGN KEY ("baleybot_id") REFERENCES "public"."baleybots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "baleybot_alerts_workspace_idx" ON "baleybot_alerts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "baleybot_alerts_baleybot_idx" ON "baleybot_alerts" USING btree ("baleybot_id");--> statement-breakpoint
CREATE INDEX "baleybot_alerts_status_idx" ON "baleybot_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "baleybot_alerts_triggered_idx" ON "baleybot_alerts" USING btree ("triggered_at");--> statement-breakpoint
CREATE UNIQUE INDEX "baleybot_memory_unique_key" ON "baleybot_memory" USING btree ("workspace_id","baleybot_id","key");--> statement-breakpoint
CREATE INDEX "baleybot_memory_workspace_idx" ON "baleybot_memory" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "baleybot_memory_baleybot_idx" ON "baleybot_memory" USING btree ("baleybot_id");--> statement-breakpoint
CREATE INDEX "baleybot_aggregates_workspace_idx" ON "baleybot_metric_aggregates" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "baleybot_aggregates_baleybot_idx" ON "baleybot_metric_aggregates" USING btree ("baleybot_id");--> statement-breakpoint
CREATE INDEX "baleybot_aggregates_period_idx" ON "baleybot_metric_aggregates" USING btree ("period","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "baleybot_aggregates_unique" ON "baleybot_metric_aggregates" USING btree ("baleybot_id","metric_name","period","period_start");--> statement-breakpoint
CREATE INDEX "baleybot_metrics_workspace_idx" ON "baleybot_metrics" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "baleybot_metrics_baleybot_idx" ON "baleybot_metrics" USING btree ("baleybot_id");--> statement-breakpoint
CREATE INDEX "baleybot_metrics_name_idx" ON "baleybot_metrics" USING btree ("metric_name");--> statement-breakpoint
CREATE INDEX "baleybot_metrics_timestamp_idx" ON "baleybot_metrics" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "baleybot_metrics_baleybot_time_idx" ON "baleybot_metrics" USING btree ("baleybot_id","timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "baleybot_shared_storage_unique_key" ON "baleybot_shared_storage" USING btree ("workspace_id","key");--> statement-breakpoint
CREATE INDEX "baleybot_shared_storage_workspace_idx" ON "baleybot_shared_storage" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "baleybot_shared_storage_expires_idx" ON "baleybot_shared_storage" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "baleybot_triggers_workspace_idx" ON "baleybot_triggers" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "baleybot_triggers_source_idx" ON "baleybot_triggers" USING btree ("source_baleybot_id");--> statement-breakpoint
CREATE INDEX "baleybot_triggers_target_idx" ON "baleybot_triggers" USING btree ("target_baleybot_id");--> statement-breakpoint
CREATE INDEX "baleybot_usage_workspace_idx" ON "baleybot_usage" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "baleybot_usage_baleybot_idx" ON "baleybot_usage" USING btree ("baleybot_id");--> statement-breakpoint
CREATE INDEX "baleybot_usage_execution_idx" ON "baleybot_usage" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "baleybot_usage_timestamp_idx" ON "baleybot_usage" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "baleybot_usage_baleybot_time_idx" ON "baleybot_usage" USING btree ("baleybot_id","timestamp");--> statement-breakpoint
CREATE INDEX "builder_events_workspace_idx" ON "builder_events" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "builder_events_entity_idx" ON "builder_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "builder_events_timestamp_idx" ON "builder_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "builder_events_sequence_idx" ON "builder_events" USING btree ("sequence_number");--> statement-breakpoint
CREATE INDEX "builder_events_type_idx" ON "builder_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "notifications_workspace_idx" ON "notifications" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "scheduled_tasks_workspace_idx" ON "scheduled_tasks" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "scheduled_tasks_baleybot_idx" ON "scheduled_tasks" USING btree ("baleybot_id");--> statement-breakpoint
CREATE INDEX "scheduled_tasks_pending_idx" ON "scheduled_tasks" USING btree ("status","run_at");--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_tool_id_tools_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_execution_id_flow_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."flow_executions"("id") ON DELETE cascade ON UPDATE no action;