CREATE TABLE IF NOT EXISTS "orchestration_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "root_execution_id" uuid,
  "entry_bot" varchar(255) NOT NULL,
  "status" varchar(50) DEFAULT 'running' NOT NULL,
  "objective" text NOT NULL,
  "strategy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "summary" text,
  "metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "orchestration_runs"
 ADD CONSTRAINT "orchestration_runs_workspace_id_workspaces_id_fk"
 FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
 ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "orchestration_runs"
 ADD CONSTRAINT "orchestration_runs_root_execution_id_baleybot_executions_id_fk"
 FOREIGN KEY ("root_execution_id") REFERENCES "public"."baleybot_executions"("id")
 ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "orchestration_runs_workspace_idx" ON "orchestration_runs" ("workspace_id");
CREATE INDEX IF NOT EXISTS "orchestration_runs_status_idx" ON "orchestration_runs" ("status");
CREATE INDEX IF NOT EXISTS "orchestration_runs_started_idx" ON "orchestration_runs" ("started_at");
CREATE INDEX IF NOT EXISTS "orchestration_runs_root_exec_idx" ON "orchestration_runs" ("root_execution_id");

CREATE TABLE IF NOT EXISTS "orchestration_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "workspace_id" uuid NOT NULL,
  "parent_task_id" uuid,
  "execution_id" uuid,
  "assigned_bot" varchar(255) NOT NULL,
  "expected_artifact" varchar(255),
  "status" varchar(50) DEFAULT 'pending' NOT NULL,
  "attempt" integer DEFAULT 0 NOT NULL,
  "depth" integer DEFAULT 0 NOT NULL,
  "fingerprint" varchar(255),
  "input" jsonb,
  "output" jsonb,
  "error" text,
  "issue_pack" jsonb,
  "strategy_hints" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "started_at" timestamp,
  "completed_at" timestamp,
  "duration_ms" integer,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "orchestration_tasks"
 ADD CONSTRAINT "orchestration_tasks_run_id_orchestration_runs_id_fk"
 FOREIGN KEY ("run_id") REFERENCES "public"."orchestration_runs"("id")
 ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "orchestration_tasks"
 ADD CONSTRAINT "orchestration_tasks_workspace_id_workspaces_id_fk"
 FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
 ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "orchestration_tasks"
 ADD CONSTRAINT "orchestration_tasks_parent_task_id_orchestration_tasks_id_fk"
 FOREIGN KEY ("parent_task_id") REFERENCES "public"."orchestration_tasks"("id")
 ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "orchestration_tasks"
 ADD CONSTRAINT "orchestration_tasks_execution_id_baleybot_executions_id_fk"
 FOREIGN KEY ("execution_id") REFERENCES "public"."baleybot_executions"("id")
 ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "orchestration_tasks_run_idx" ON "orchestration_tasks" ("run_id");
CREATE INDEX IF NOT EXISTS "orchestration_tasks_workspace_idx" ON "orchestration_tasks" ("workspace_id");
CREATE INDEX IF NOT EXISTS "orchestration_tasks_parent_idx" ON "orchestration_tasks" ("parent_task_id");
CREATE INDEX IF NOT EXISTS "orchestration_tasks_status_idx" ON "orchestration_tasks" ("status");
CREATE INDEX IF NOT EXISTS "orchestration_tasks_bot_idx" ON "orchestration_tasks" ("assigned_bot");
CREATE INDEX IF NOT EXISTS "orchestration_tasks_fingerprint_idx" ON "orchestration_tasks" ("fingerprint");
CREATE INDEX IF NOT EXISTS "orchestration_tasks_run_status_idx" ON "orchestration_tasks" ("run_id","status");
