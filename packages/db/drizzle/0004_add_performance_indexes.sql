-- baleybotExecutions indexes
CREATE INDEX IF NOT EXISTS idx_baleybot_executions_baleybot_id
  ON baleybot_executions(baleybot_id);
CREATE INDEX IF NOT EXISTS idx_baleybot_executions_status
  ON baleybot_executions(status);
CREATE INDEX IF NOT EXISTS idx_baleybot_executions_created_at
  ON baleybot_executions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_baleybot_executions_baleybot_status
  ON baleybot_executions(baleybot_id, status);

-- flowExecutions indexes
CREATE INDEX IF NOT EXISTS idx_flow_executions_flow_id
  ON flow_executions(flow_id);
CREATE INDEX IF NOT EXISTS idx_flow_executions_status
  ON flow_executions(status);
CREATE INDEX IF NOT EXISTS idx_flow_executions_created_at
  ON flow_executions(created_at DESC);

-- webhookLogs indexes
CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook_id
  ON webhook_logs(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at
  ON webhook_logs(created_at DESC);

-- tools indexes
CREATE INDEX IF NOT EXISTS idx_tools_workspace_id
  ON tools(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tools_connection_id
  ON tools(connection_id);

-- blocks indexes
CREATE INDEX IF NOT EXISTS idx_blocks_workspace_id
  ON blocks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_blocks_flow_id
  ON blocks(flow_id);

-- baleybots indexes (soft delete)
CREATE INDEX IF NOT EXISTS idx_baleybots_workspace_deleted
  ON baleybots(workspace_id, deleted_at)
  WHERE deleted_at IS NULL;

-- flows indexes (soft delete)
CREATE INDEX IF NOT EXISTS idx_flows_workspace_deleted
  ON flows(workspace_id, deleted_at)
  WHERE deleted_at IS NULL;

-- connections indexes
CREATE INDEX IF NOT EXISTS idx_connections_workspace_id
  ON connections(workspace_id);
CREATE INDEX IF NOT EXISTS idx_connections_workspace_default
  ON connections(workspace_id, is_default)
  WHERE is_default = true;
