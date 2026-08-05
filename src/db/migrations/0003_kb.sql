-- 0003_kb.sql — Knowledge base / RAG (P1).
-- A knowledge base owns documents; each document is split into chunks whose
-- embeddings are stored inline as a JSON float array. Retrieval loads a KB's
-- chunks and ranks them by cosine similarity in-process (local-first, small KBs).

CREATE TABLE knowledge_bases (
  id                     TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  embedding_provider_id  TEXT,
  embedding_model        TEXT NOT NULL,
  created_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE kb_documents (
  id          TEXT PRIMARY KEY,
  kb_id       TEXT NOT NULL,
  title       TEXT NOT NULL,
  source      TEXT,
  char_count  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_kb_documents_kb ON kb_documents (kb_id);

CREATE TABLE kb_chunks (
  id             TEXT PRIMARY KEY,
  kb_id          TEXT NOT NULL,
  document_id    TEXT NOT NULL,
  ordinal        INTEGER NOT NULL DEFAULT 0,
  content        TEXT NOT NULL,
  embedding_json TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_kb_chunks_kb ON kb_chunks (kb_id);
CREATE INDEX idx_kb_chunks_doc ON kb_chunks (document_id);
