-- 0005_assistant.sql — per-agent capability config.
-- Until now tools/MCP/knowledge were global: every agent saw every registered
-- tool and could search every knowledge base. An agent now owns its own
-- capability surface, so a roleplay character and a research assistant can
-- share one app without sharing tools.
--   tool_mode  : disabled | auto      (built-in tools)
--   mcp_mode   : disabled | auto | manual  (manual = only tools listed in enabled_tools_json)
--   max_tool_calls : per-turn tool round budget
--   enabled_tools_json : JSON string[] whitelist; NULL = all tools of an enabled kind

ALTER TABLE agents ADD COLUMN tool_mode TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE agents ADD COLUMN mcp_mode TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE agents ADD COLUMN max_tool_calls INTEGER NOT NULL DEFAULT 6;
ALTER TABLE agents ADD COLUMN enabled_tools_json TEXT;

CREATE TABLE agent_knowledge_bases (
  agent_id TEXT NOT NULL,
  kb_id    TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (agent_id, kb_id)
);
CREATE INDEX idx_agent_kb_agent ON agent_knowledge_bases (agent_id);
