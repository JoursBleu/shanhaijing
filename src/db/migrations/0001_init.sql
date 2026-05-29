-- 0001_init.sql
-- Iron law (enforced in code, not DB): every conversation has a user_persona_id.
-- There is no agent-only conversation type in v1.

CREATE TABLE providers (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  base_url             TEXT NOT NULL,
  api_key_encrypted    TEXT,
  kind                 TEXT NOT NULL CHECK (kind IN ('openai','anthropic','ollama','custom')),
  enabled              INTEGER NOT NULL DEFAULT 1,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE models (
  id                   TEXT PRIMARY KEY,
  provider_id          TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  context_length       INTEGER,
  supports_vision      INTEGER NOT NULL DEFAULT 0,
  cached_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (provider_id, name)
);

CREATE TABLE user_personas (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  avatar_path          TEXT,
  bio                  TEXT NOT NULL DEFAULT '',
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE folders (
  id                   TEXT PRIMARY KEY,
  kind                 TEXT NOT NULL CHECK (kind IN ('agent','conversation')),
  name                 TEXT NOT NULL,
  parent_id            TEXT REFERENCES folders(id) ON DELETE SET NULL,
  position             INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE character_cards (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  raw_file_path        TEXT NOT NULL,
  parsed_json          TEXT NOT NULL,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE skills (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  description          TEXT NOT NULL DEFAULT '',
  body_markdown        TEXT NOT NULL,
  metadata_json        TEXT NOT NULL DEFAULT '{}',
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE agents (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  avatar_path          TEXT,
  signature            TEXT NOT NULL DEFAULT '',
  default_provider_id  TEXT REFERENCES providers(id) ON DELETE SET NULL,
  default_model        TEXT,
  default_temperature  REAL NOT NULL DEFAULT 0.7,
  default_max_tokens   INTEGER,
  default_top_p        REAL NOT NULL DEFAULT 1.0,
  card_id              TEXT REFERENCES character_cards(id) ON DELETE SET NULL,
  persona_text         TEXT,
  greeting             TEXT,
  memory_enabled       INTEGER NOT NULL DEFAULT 0,
  folder_id            TEXT REFERENCES folders(id) ON DELETE SET NULL,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE agent_skills (
  agent_id             TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  skill_id             TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  position             INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (agent_id, skill_id)
);

CREATE TABLE conversations (
  id                   TEXT PRIMARY KEY,
  kind                 TEXT NOT NULL CHECK (kind IN ('private','casual','work')),
  title                TEXT NOT NULL DEFAULT '',
  user_persona_id      TEXT NOT NULL REFERENCES user_personas(id),
  folder_id            TEXT REFERENCES folders(id) ON DELETE SET NULL,

  task_goal            TEXT,
  task_status          TEXT CHECK (task_status IN ('open','done','abandoned')),
  task_summary         TEXT,
  cost_limit_cents     INTEGER,
  cost_used_cents      INTEGER NOT NULL DEFAULT 0,
  initial_responder    TEXT REFERENCES agents(id) ON DELETE SET NULL,
  max_total_turns      INTEGER,
  max_per_agent_turns  INTEGER,

  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE conversation_agents (
  conversation_id      TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  agent_id             TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  provider_id          TEXT REFERENCES providers(id) ON DELETE SET NULL,
  model                TEXT,
  temperature          REAL,
  max_tokens           INTEGER,
  top_p                REAL,
  PRIMARY KEY (conversation_id, agent_id)
);

CREATE TABLE messages (
  id                       TEXT PRIMARY KEY,
  conversation_id          TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role                     TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
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
  created_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_parent ON messages(parent_id);

CREATE TABLE memories (
  id                   TEXT PRIMARY KEY,
  agent_id             TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  conversation_id      TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  kind                 TEXT NOT NULL CHECK (kind IN ('fact','summary','preference')),
  content              TEXT NOT NULL,
  embedding            BLOB,
  importance           REAL NOT NULL DEFAULT 0.5,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_memories_agent ON memories(agent_id, importance DESC);
