-- 0002_mcp.sql — MCP (Model Context Protocol) server registry (P1).
-- Streamable-HTTP MCP servers whose tools are exposed to the agent loop.

CREATE TABLE mcp_servers (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  transport     TEXT NOT NULL DEFAULT 'http' CHECK (transport IN ('http','sse')),
  url           TEXT NOT NULL,
  headers_json  TEXT NOT NULL DEFAULT '{}',
  enabled       INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
