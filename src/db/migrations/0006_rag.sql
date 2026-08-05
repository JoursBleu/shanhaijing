-- 0006_rag.sql — retrieval quality knobs per knowledge base.
-- Chunking was hardcoded (900/150) and retrieval was pure cosine over every
-- chunk. A KB now carries its own chunking, search mode and optional reranker
-- so a code KB and a novel KB can be tuned independently.
--   search_mode : vector | hybrid   (hybrid = vector + lexical, fused by RRF)

ALTER TABLE knowledge_bases ADD COLUMN chunk_size INTEGER NOT NULL DEFAULT 900;
ALTER TABLE knowledge_bases ADD COLUMN chunk_overlap INTEGER NOT NULL DEFAULT 150;
ALTER TABLE knowledge_bases ADD COLUMN search_mode TEXT NOT NULL DEFAULT 'hybrid';
ALTER TABLE knowledge_bases ADD COLUMN top_k INTEGER NOT NULL DEFAULT 5;
ALTER TABLE knowledge_bases ADD COLUMN rerank_provider_id TEXT;
ALTER TABLE knowledge_bases ADD COLUMN rerank_model TEXT;
