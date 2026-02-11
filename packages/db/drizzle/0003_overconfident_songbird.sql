ALTER TABLE "baleybot_executions" ADD COLUMN "model" varchar(255);--> statement-breakpoint
ALTER TABLE "baleybot_executions" ADD COLUMN "tokens_input" integer;--> statement-breakpoint
ALTER TABLE "baleybot_executions" ADD COLUMN "tokens_output" integer;--> statement-breakpoint
ALTER TABLE "baleybot_executions" ADD COLUMN "estimated_cost" double precision;--> statement-breakpoint
ALTER TABLE "baleybot_executions" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
CREATE INDEX "baleybot_executions_model_idx" ON "baleybot_executions" USING btree ("model");--> statement-breakpoint
CREATE INDEX "bb_exec_conversation_idx" ON "baleybot_executions" USING btree ("baleybot_id","conversation_id");