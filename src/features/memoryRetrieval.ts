/**
 * Embedding-first memory retrieval with a lexical fallback.
 *
 * If a global embedding config is set and the agent has memories with stored
 * vectors, rank by cosine similarity. Otherwise fall back to the naive lexical
 * ranking in repos/memories (so retrieval always works, even unconfigured).
 */

import type { Memory } from "@/types/domain";
import {
  listMemoriesForAgent,
  retrieveMemoriesForAgent,
  createMemory,
  setMemoryEmbedding,
  type CreateMemoryInput,
} from "@/repos/memories";
import { getGlobalEmbeddingConfig } from "@/features/embedding";
import { embed, cosineSim } from "@/llm/embeddings";

function parseVec(s: string | null | undefined): number[] | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) && v.length ? (v as number[]) : null;
  } catch {
    return null;
  }
}

export async function retrieveMemories(
  agentId: string,
  query: string,
  topK = 5,
): Promise<Memory[]> {
  const cfg = await getGlobalEmbeddingConfig();
  if (cfg) {
    const all = await listMemoriesForAgent(agentId, { limit: 500 });
    const withVec = all
      .map((m) => ({ m, vec: parseVec(m.embedding_json) }))
      .filter((x): x is { m: Memory; vec: number[] } => x.vec !== null);
    if (withVec.length > 0) {
      try {
        const [qv] = await embed({ ...cfg, input: [query] });
        if (qv && qv.length) {
          const scored = withVec.map((x) => ({
            m: x.m,
            score: cosineSim(qv, x.vec),
          }));
          scored.sort((a, b) => b.score - a.score);
          return scored.slice(0, topK).map((s) => s.m);
        }
      } catch {
        // network/model error → lexical fallback below
      }
    }
  }
  return retrieveMemoriesForAgent(agentId, query, topK);
}

/**
 * Create a memory and, if a global embedding config exists, attach its vector
 * (best-effort). Used by every memory-creation path so semantic recall works
 * without a manual backfill.
 */
export async function createMemoryEmbedded(
  input: CreateMemoryInput,
  signal?: AbortSignal,
): Promise<string> {
  const id = await createMemory(input);
  try {
    const cfg = await getGlobalEmbeddingConfig();
    if (cfg) {
      const [vec] = await embed({ ...cfg, input: [input.content], signal });
      if (vec && vec.length) await setMemoryEmbedding(id, vec);
    }
  } catch {
    // memory is saved; vector can be backfilled later
  }
  return id;
}
