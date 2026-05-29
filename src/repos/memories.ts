import { getDb } from "@/db";
import { newId } from "@/lib/id";
import type { Memory, MemoryKind } from "@/types/domain";

export interface CreateMemoryInput {
  agent_id: string;
  conversation_id?: string | null;
  kind: MemoryKind;
  content: string;
  importance?: number;
}

export async function createMemory(input: CreateMemoryInput): Promise<string> {
  const id = newId();
  const db = await getDb();
  await db.execute(
    `INSERT INTO memories
     (id, agent_id, conversation_id, kind, content, importance)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.agent_id,
      input.conversation_id ?? null,
      input.kind,
      input.content,
      input.importance ?? 0.5,
    ],
  );
  return id;
}

export async function listMemoriesForAgent(
  agentId: string,
  opts: { limit?: number; kinds?: MemoryKind[] } = {},
): Promise<Memory[]> {
  const db = await getDb();
  const limit = opts.limit ?? 50;
  if (opts.kinds && opts.kinds.length > 0) {
    const placeholders = opts.kinds.map(() => "?").join(",");
    return db.select<Memory[]>(
      `SELECT * FROM memories
       WHERE agent_id = ? AND kind IN (${placeholders})
       ORDER BY importance DESC, created_at DESC LIMIT ?`,
      [agentId, ...opts.kinds, limit],
    );
  }
  return db.select<Memory[]>(
    `SELECT * FROM memories WHERE agent_id = ?
     ORDER BY importance DESC, created_at DESC LIMIT ?`,
    [agentId, limit],
  );
}

/** Very naive lexical retrieval: split query into tokens (>=2 chars) and rank
 * memories by how many tokens are substring matches, then by importance. */
export async function retrieveMemoriesForAgent(
  agentId: string,
  query: string,
  topK = 5,
): Promise<Memory[]> {
  const all = await listMemoriesForAgent(agentId, { limit: 200 });
  if (all.length === 0) return [];
  const q = query.toLowerCase();
  const tokens = Array.from(
    new Set(
      q
        .split(/[\s,.;:!?，。；：！？、\-\(\)\[\]"'`]+/u)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2),
    ),
  );
  const scored = all.map((m) => {
    const c = m.content.toLowerCase();
    let hits = 0;
    for (const t of tokens) if (c.includes(t)) hits++;
    return { m, score: hits + m.importance };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((s) => s.m);
}

export async function deleteMemory(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM memories WHERE id = ?", [id]);
}

export async function updateMemory(
  id: string,
  patch: { content?: string; importance?: number; kind?: MemoryKind },
): Promise<void> {
  const db = await getDb();
  const fields: string[] = [];
  const values: any[] = [];
  if (patch.content !== undefined) {
    fields.push("content = ?");
    values.push(patch.content);
  }
  if (patch.importance !== undefined) {
    fields.push("importance = ?");
    values.push(patch.importance);
  }
  if (patch.kind !== undefined) {
    fields.push("kind = ?");
    values.push(patch.kind);
  }
  if (fields.length === 0) return;
  values.push(id);
  await db.execute(
    `UPDATE memories SET ${fields.join(", ")} WHERE id = ?`,
    values,
  );
}
