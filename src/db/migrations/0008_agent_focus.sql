-- 0008_agent_focus.sql — 收敛成单 agent 工具形态。
--
-- 群聊、角色卡、多用户身份从主线移除（v1 实现保留在 v1-multi-agent 分支）。
-- 这三者互相咬合：conversations 靠 user_persona_id 强制"你在房间里"，
-- conversation_agents 支持一房多 agent，agents.card_id/signature 只在群里有意义。
--
-- 群会话是**删除**而不是降级：一个 3 agent 的工作群没有办法诚实地表示成 1v1，
-- 硬留下来只会得到一堆看不懂的半截对话。私聊全部保留。

PRAGMA foreign_keys=OFF;

-- 1. 丢弃群会话及其消息/记忆引用（messages 有 ON DELETE CASCADE，先手动清干净引用）
DELETE FROM messages WHERE conversation_id IN
  (SELECT id FROM conversations WHERE kind <> 'private');
UPDATE memories SET conversation_id = NULL WHERE conversation_id IN
  (SELECT id FROM conversations WHERE kind <> 'private');
DELETE FROM conversations WHERE kind <> 'private';

-- 2. conversations：去掉 kind / persona / 任务与轮数预算，agent_id 提升为直接列。
--    私聊必然只有一个 conversation_agents 行，把它折叠进来。
CREATE TABLE conversations_new (
  id                   TEXT PRIMARY KEY,
  title                TEXT NOT NULL DEFAULT '',
  agent_id             TEXT REFERENCES agents(id) ON DELETE SET NULL,
  folder_id            TEXT REFERENCES folders(id) ON DELETE SET NULL,
  provider_id          TEXT REFERENCES providers(id) ON DELETE SET NULL,
  model                TEXT,
  temperature          REAL,
  max_tokens           INTEGER,
  top_p                REAL,
  cost_used_cents      INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO conversations_new
  (id, title, agent_id, folder_id, provider_id, model, temperature, max_tokens,
   top_p, cost_used_cents, created_at, updated_at)
SELECT c.id, c.title, ca.agent_id, c.folder_id, ca.provider_id, ca.model,
       ca.temperature, ca.max_tokens, ca.top_p, c.cost_used_cents,
       c.created_at, c.updated_at
FROM conversations c
LEFT JOIN conversation_agents ca ON ca.conversation_id = c.id;

DROP TABLE conversations;
ALTER TABLE conversations_new RENAME TO conversations;
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);

-- 3. agents：card_id / signature 随角色卡和群聊一起去掉
CREATE TABLE agents_new (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  avatar_path          TEXT,
  default_provider_id  TEXT REFERENCES providers(id) ON DELETE SET NULL,
  default_model        TEXT,
  default_temperature  REAL NOT NULL DEFAULT 0.7,
  default_max_tokens   INTEGER,
  default_top_p        REAL NOT NULL DEFAULT 1.0,
  persona_text         TEXT,
  greeting             TEXT,
  memory_enabled       INTEGER NOT NULL DEFAULT 1,
  folder_id            TEXT REFERENCES folders(id) ON DELETE SET NULL,
  tool_mode            TEXT NOT NULL DEFAULT 'auto',
  mcp_mode             TEXT NOT NULL DEFAULT 'auto',
  max_tool_calls       INTEGER NOT NULL DEFAULT 6,
  enabled_tools_json   TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO agents_new
  (id, name, avatar_path, default_provider_id, default_model, default_temperature,
   default_max_tokens, default_top_p, persona_text, greeting, memory_enabled,
   folder_id, tool_mode, mcp_mode, max_tool_calls, enabled_tools_json, created_at)
SELECT id, name, avatar_path, default_provider_id, default_model, default_temperature,
       default_max_tokens, default_top_p, persona_text, greeting, memory_enabled,
       folder_id, tool_mode, mcp_mode, max_tool_calls, enabled_tools_json, created_at
FROM agents;

DROP TABLE agents;
ALTER TABLE agents_new RENAME TO agents;

-- 4. messages：mentioned_agent_ids 是 @提及 调度的遗留
CREATE TABLE messages_new (
  id                       TEXT PRIMARY KEY,
  conversation_id          TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role                     TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  sender_id                TEXT,
  parent_id                TEXT REFERENCES messages(id) ON DELETE SET NULL,
  active_branch_id         TEXT,
  variant_group_id         TEXT,
  variant_index            INTEGER NOT NULL DEFAULT 0,
  content                  TEXT NOT NULL,
  turn_id                  TEXT,
  in_reply_to_message_id   TEXT REFERENCES messages(id) ON DELETE SET NULL,
  tokens_in                INTEGER,
  tokens_out               INTEGER,
  cost_cents               INTEGER,
  tool_calls_json          TEXT,
  tool_call_id             TEXT,
  tool_name                TEXT,
  hidden                   INTEGER NOT NULL DEFAULT 0,
  created_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO messages_new
  (id, conversation_id, role, sender_id, parent_id, active_branch_id,
   variant_group_id, variant_index, content, turn_id, in_reply_to_message_id,
   tokens_in, tokens_out, cost_cents, tool_calls_json, tool_call_id, tool_name,
   hidden, created_at)
SELECT id, conversation_id, role, sender_id, parent_id, active_branch_id,
       variant_group_id, variant_index, content, turn_id, in_reply_to_message_id,
       tokens_in, tokens_out, cost_cents, tool_calls_json, tool_call_id, tool_name,
       hidden, created_at
FROM messages;

DROP TABLE messages;
ALTER TABLE messages_new RENAME TO messages;

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_parent ON messages(parent_id);
CREATE INDEX idx_messages_turn ON messages(turn_id);

-- 5. 彻底移除的表
DROP TABLE conversation_agents;
DROP TABLE character_cards;
DROP TABLE user_personas;

PRAGMA foreign_keys=ON;
