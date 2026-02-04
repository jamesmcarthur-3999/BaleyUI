-- Add cascade delete to tools.connectionId
ALTER TABLE tools
DROP CONSTRAINT IF EXISTS tools_connection_id_fkey,
ADD CONSTRAINT tools_connection_id_fkey
  FOREIGN KEY (connection_id)
  REFERENCES connections(id)
  ON DELETE CASCADE;

-- Add cascade delete to blocks.connectionId
ALTER TABLE blocks
DROP CONSTRAINT IF EXISTS blocks_connection_id_fkey,
ADD CONSTRAINT blocks_connection_id_fkey
  FOREIGN KEY (connection_id)
  REFERENCES connections(id)
  ON DELETE CASCADE;

-- Add cascade delete to webhookLogs.executionId
ALTER TABLE webhook_logs
DROP CONSTRAINT IF EXISTS webhook_logs_execution_id_fkey,
ADD CONSTRAINT webhook_logs_execution_id_fkey
  FOREIGN KEY (execution_id)
  REFERENCES flow_executions(id)
  ON DELETE CASCADE;

-- Add cascade delete to toolExecutions.toolId
ALTER TABLE tool_executions
DROP CONSTRAINT IF EXISTS tool_executions_tool_id_fkey,
ADD CONSTRAINT tool_executions_tool_id_fkey
  FOREIGN KEY (tool_id)
  REFERENCES tools(id)
  ON DELETE CASCADE;
