-- Repository writes require separate opt-ins; existing MCP tokens gain no new writes.
ALTER TABLE mcp_settings ADD COLUMN IF NOT EXISTS sync_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE mcp_settings ADD COLUMN IF NOT EXISTS git_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE mcp_settings ADD COLUMN IF NOT EXISTS domains_enabled boolean NOT NULL DEFAULT false;
