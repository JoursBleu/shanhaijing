-- 0009_runtime.sql — dual runtime selection and external runtime session mapping.
-- Existing agents and conversations stay on the compatibility runtime.

ALTER TABLE agents
  ADD COLUMN runtime TEXT NOT NULL DEFAULT 'legacy'
  CHECK (runtime IN ('legacy', 'dsh'));

ALTER TABLE conversations
  ADD COLUMN runtime TEXT NOT NULL DEFAULT 'legacy'
  CHECK (runtime IN ('legacy', 'dsh'));

CREATE TABLE runtime_sessions (
  conversation_id          TEXT PRIMARY KEY
                           REFERENCES conversations(id) ON DELETE CASCADE,
  runtime                  TEXT NOT NULL
                           CHECK (runtime IN ('legacy', 'dsh')),
  runtime_session_id       TEXT NOT NULL,
  bridge_protocol_version  INTEGER NOT NULL,
  last_event_cursor        TEXT,
  state                    TEXT NOT NULL DEFAULT 'ready'
                           CHECK (state IN ('creating','ready','running','stopped','failed')),
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (runtime, runtime_session_id)
);

CREATE INDEX idx_runtime_sessions_runtime_id
  ON runtime_sessions(runtime, runtime_session_id);