-- 0007_tool_messages.sql — persist structured tool turns.
-- Tool calls used to survive only as a Markdown trace inside the assistant's
-- content, so reopening a conversation lost the actual tool_calls/tool results
-- and the model could no longer see what it had already looked up. The role
-- CHECK constraint has to be widened, which in SQLite means rebuilding the
-- table. Column order and defaults are preserved so existing rows copy 1:1.

PRAGMA foreign_keys=OFF;

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
  mentioned_agent_ids      TEXT NOT NULL DEFAULT '[]',
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
   variant_group_id, variant_index, content, mentioned_agent_ids, turn_id,
   in_reply_to_message_id, tokens_in, tokens_out, cost_cents, created_at)
SELECT
   id, conversation_id, role, sender_id, parent_id, active_branch_id,
   variant_group_id, variant_index, content, mentioned_agent_ids, turn_id,
   in_reply_to_message_id, tokens_in, tokens_out, cost_cents, created_at
FROM messages;

DROP TABLE messages;
ALTER TABLE messages_new RENAME TO messages;

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_parent ON messages(parent_id);
CREATE INDEX idx_messages_turn ON messages(turn_id);

PRAGMA foreign_keys=ON;
