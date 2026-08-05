import { getDb } from "@/db";
import { newId } from "@/lib/id";

export type KbSearchMode = "vector" | "hybrid";

export interface KnowledgeBase {
  id: string;
  name: string;
  embedding_provider_id: string | null;
  embedding_model: string;
  chunk_size: number;
  chunk_overlap: number;
  search_mode: KbSearchMode;
  top_k: number;
  rerank_provider_id: string | null;
  rerank_model: string | null;
  created_at: string;
}

export interface KbDocument {
  id: string;
  kb_id: string;
  title: string;
  source: string | null;
  char_count: number;
  created_at: string;
}

export interface KbChunk {
  id: string;
  kb_id: string;
  document_id: string;
  ordinal: number;
  content: string;
  embedding: number[];
}

// ---- Knowledge bases ----

export async function listKnowledgeBases(): Promise<KnowledgeBase[]> {
  const db = await getDb();
  return db.select<KnowledgeBase[]>(
    "SELECT * FROM knowledge_bases ORDER BY created_at",
  );
}

export async function getKnowledgeBase(
  id: string,
): Promise<KnowledgeBase | null> {
  const db = await getDb();
  const rows = await db.select<KnowledgeBase[]>(
    "SELECT * FROM knowledge_bases WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

export async function createKnowledgeBase(input: {
  name: string;
  embedding_provider_id: string | null;
  embedding_model: string;
  chunk_size?: number;
  chunk_overlap?: number;
  search_mode?: KbSearchMode;
  top_k?: number;
  rerank_provider_id?: string | null;
  rerank_model?: string | null;
}): Promise<string> {
  const id = newId();
  const db = await getDb();
  await db.execute(
    `INSERT INTO knowledge_bases
     (id, name, embedding_provider_id, embedding_model, chunk_size,
      chunk_overlap, search_mode, top_k, rerank_provider_id, rerank_model)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.embedding_provider_id,
      input.embedding_model,
      input.chunk_size ?? 900,
      input.chunk_overlap ?? 150,
      input.search_mode ?? "hybrid",
      input.top_k ?? 5,
      input.rerank_provider_id ?? null,
      input.rerank_model ?? null,
    ],
  );
  return id;
}

export async function updateKnowledgeBase(
  id: string,
  patch: Partial<Omit<KnowledgeBase, "id" | "created_at">>,
): Promise<void> {
  const entries = Object.entries(patch);
  if (entries.length === 0) return;
  const db = await getDb();
  await db.execute(
    `UPDATE knowledge_bases SET ${entries.map(([k]) => `${k} = ?`).join(", ")} WHERE id = ?`,
    [...entries.map(([, v]) => v), id],
  );
}

export async function deleteKnowledgeBase(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM kb_chunks WHERE kb_id = ?", [id]);
  await db.execute("DELETE FROM kb_documents WHERE kb_id = ?", [id]);
  await db.execute("DELETE FROM agent_knowledge_bases WHERE kb_id = ?", [id]);
  await db.execute("DELETE FROM knowledge_bases WHERE id = ?", [id]);
}

// ---- Documents ----

export async function listDocuments(kbId: string): Promise<KbDocument[]> {
  const db = await getDb();
  return db.select<KbDocument[]>(
    "SELECT * FROM kb_documents WHERE kb_id = ? ORDER BY created_at DESC",
    [kbId],
  );
}

export async function createDocument(input: {
  kb_id: string;
  title: string;
  source?: string | null;
  char_count: number;
}): Promise<string> {
  const id = newId();
  const db = await getDb();
  await db.execute(
    `INSERT INTO kb_documents (id, kb_id, title, source, char_count)
     VALUES (?, ?, ?, ?, ?)`,
    [id, input.kb_id, input.title, input.source ?? null, input.char_count],
  );
  return id;
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM kb_chunks WHERE document_id = ?", [id]);
  await db.execute("DELETE FROM kb_documents WHERE id = ?", [id]);
}

// ---- Chunks ----

interface ChunkRow {
  id: string;
  kb_id: string;
  document_id: string;
  ordinal: number;
  content: string;
  embedding_json: string;
}

export async function insertChunks(
  kbId: string,
  documentId: string,
  chunks: { ordinal: number; content: string; embedding: number[] }[],
): Promise<void> {
  const db = await getDb();
  for (const c of chunks) {
    await db.execute(
      `INSERT INTO kb_chunks (id, kb_id, document_id, ordinal, content, embedding_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        kbId,
        documentId,
        c.ordinal,
        c.content,
        JSON.stringify(c.embedding),
      ],
    );
  }
}

export async function listChunksForKb(kbId: string): Promise<KbChunk[]> {
  const db = await getDb();
  const rows = await db.select<ChunkRow[]>(
    "SELECT * FROM kb_chunks WHERE kb_id = ?",
    [kbId],
  );
  return rows.map((r) => ({
    id: r.id,
    kb_id: r.kb_id,
    document_id: r.document_id,
    ordinal: r.ordinal,
    content: r.content,
    embedding: safeParseVec(r.embedding_json),
  }));
}

export async function countChunks(kbId: string): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM kb_chunks WHERE kb_id = ?",
    [kbId],
  );
  return rows[0]?.n ?? 0;
}

function safeParseVec(s: string): number[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? (v as number[]) : [];
  } catch {
    return [];
  }
}
