-- 0004_embedding.sql — global embedding config + memory vector column (P1).
-- app_settings: tiny KV store (first use: which provider/model embeds memories).
-- memories.embedding_json: JSON float array, mirrors kb_chunks.embedding_json.
-- (The original memories.embedding BLOB column from 0001 stays unused.)

CREATE TABLE app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

ALTER TABLE memories ADD COLUMN embedding_json TEXT;
