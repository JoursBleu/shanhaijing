/**
 * Knowledge base ingest + retrieval (RAG).
 *
 * Ingest:   text → chunks (per-KB size/overlap) → embeddings → kb_chunks.
 * Retrieve: vector search, optionally fused with a lexical pass (hybrid) via
 *           Reciprocal Rank Fusion, then optionally reranked by a cross-encoder.
 *
 * Pure vector search misses exact identifiers (error codes, function names,
 * rare proper nouns) because embeddings smooth them away; pure lexical search
 * misses paraphrases. RRF needs no score calibration between the two arms,
 * which is why it is used instead of a weighted sum.
 *
 * Retrieval is exposed to the agent via the `search_knowledge` tool
 * (registered in features/builtinTools.ts).
 */

import { getProvider } from "@/repos/providers";
import { decryptSecret } from "@/lib/crypto";
import { embed, cosineSim } from "@/llm/embeddings";
import { rerank } from "@/llm/rerank";
import { lexicalScores, topIndices, rrf } from "@/lib/lexical";
import {
  getKnowledgeBase,
  listKnowledgeBases,
  createDocument,
  insertChunks,
  listChunksForKb,
  type KnowledgeBase,
} from "@/repos/knowledge";

const EMBED_BATCH = 16;
/** How many candidates each retrieval arm contributes before fusion/rerank. */
const CANDIDATE_POOL = 30;

export interface ChunkOptions {
  size: number;
  overlap: number;
}

/** Paragraph-aware chunking with a sliding-window fallback for long blocks. */
export function chunkText(
  text: string,
  opts: ChunkOptions = { size: 900, overlap: 150 },
): string[] {
  const size = Math.max(100, opts.size);
  const overlap = Math.max(0, Math.min(opts.overlap, size - 50));
  const clean = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!clean) return [];
  const paras = clean
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let buf = "";
  const flush = () => {
    if (buf.trim()) chunks.push(buf.trim());
    buf = "";
  };

  for (const p of paras) {
    if (p.length > size) {
      flush();
      const step = Math.max(1, size - overlap);
      for (let i = 0; i < p.length; i += step) {
        chunks.push(p.slice(i, i + size));
      }
      continue;
    }
    if (buf && buf.length + 2 + p.length > size) {
      flush();
      buf = p;
    } else {
      buf = buf ? `${buf}\n\n${p}` : p;
    }
  }
  flush();
  return chunks;
}

interface ProviderCreds {
  base_url: string;
  api_key: string;
  model: string;
}

async function credsFor(
  providerId: string | null,
  model: string | null,
  what: string,
): Promise<ProviderCreds> {
  if (!providerId) throw new Error(`知识库未配置 ${what} provider`);
  if (!model) throw new Error(`知识库未配置 ${what} 模型`);
  const provider = await getProvider(providerId);
  if (!provider) throw new Error(`${what} provider 已被删除`);
  const api_key = await decryptSecret(provider.api_key_encrypted);
  return { base_url: provider.base_url, api_key, model };
}

function embedConfigFor(kb: KnowledgeBase): Promise<ProviderCreds> {
  return credsFor(kb.embedding_provider_id, kb.embedding_model, "embedding");
}

export interface IngestResult {
  documentId: string;
  chunks: number;
}

export async function ingestText(input: {
  kbId: string;
  title: string;
  text: string;
  source?: string | null;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}): Promise<IngestResult> {
  const kb = await getKnowledgeBase(input.kbId);
  if (!kb) throw new Error("知识库不存在");
  const cfg = await embedConfigFor(kb);
  const chunks = chunkText(input.text, {
    size: kb.chunk_size,
    overlap: kb.chunk_overlap,
  });
  if (chunks.length === 0) throw new Error("没有可入库的文本");

  const vectors: number[][] = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH);
    const vs = await embed({ ...cfg, input: batch, signal: input.signal });
    if (vs.length !== batch.length) {
      throw new Error(
        `embedding 返回数量不符（期望 ${batch.length}，得到 ${vs.length}）`,
      );
    }
    vectors.push(...vs);
    input.onProgress?.(Math.min(i + EMBED_BATCH, chunks.length), chunks.length);
  }

  const documentId = await createDocument({
    kb_id: input.kbId,
    title: input.title,
    source: input.source ?? null,
    char_count: input.text.length,
  });
  await insertChunks(
    input.kbId,
    documentId,
    chunks.map((content, i) => ({ ordinal: i, content, embedding: vectors[i]! })),
  );
  return { documentId, chunks: chunks.length };
}

export interface KbHit {
  kbId: string;
  kbName: string;
  documentId: string;
  content: string;
  score: number;
}

export interface SearchKnowledgeOptions {
  /** KB id or name; omit to search every allowed KB. */
  kb?: string;
  limit?: number;
  /** Restrict to these KB ids (the calling agent's bindings). null = no limit. */
  allowedKbIds?: string[] | null;
  signal?: AbortSignal;
}

export async function searchKnowledge(
  query: string,
  opts: SearchKnowledgeOptions = {},
): Promise<KbHit[]> {
  const all = await listKnowledgeBases();
  const allowed = opts.allowedKbIds
    ? all.filter((k) => opts.allowedKbIds!.includes(k.id))
    : all;
  const target = opts.kb
    ? allowed.filter(
        (k) => k.id === opts.kb || k.name.toLowerCase() === opts.kb!.toLowerCase(),
      )
    : allowed;
  if (target.length === 0) return [];

  // Cache the query embedding per (provider, model): KBs often share one.
  const queryVecCache = new Map<string, number[]>();
  const hits: KbHit[] = [];

  for (const kb of target) {
    const chunks = await listChunksForKb(kb.id);
    if (chunks.length === 0) continue;
    const limit = Math.max(1, Math.min(20, opts.limit ?? kb.top_k));

    let vectorRank: number[] = [];
    if (kb.embedding_provider_id) {
      const cacheKey = `${kb.embedding_provider_id}::${kb.embedding_model}`;
      let qv = queryVecCache.get(cacheKey);
      if (!qv) {
        const cfg = await embedConfigFor(kb);
        const vs = await embed({ ...cfg, input: [query], signal: opts.signal });
        qv = vs[0] ?? [];
        queryVecCache.set(cacheKey, qv);
      }
      if (qv.length > 0) {
        const sims = chunks.map((c) => cosineSim(qv!, c.embedding));
        vectorRank = topIndices(sims, CANDIDATE_POOL);
      }
    }

    const arms = [vectorRank];
    if (kb.search_mode === "hybrid" || vectorRank.length === 0) {
      const lex = lexicalScores(query, chunks.map((c) => c.content));
      arms.push(topIndices(lex, CANDIDATE_POOL));
    }

    const fused = [...rrf(arms.filter((a) => a.length > 0))].sort(
      (a, b) => b[1] - a[1],
    );
    if (fused.length === 0) continue;

    let ordered = fused.map(([idx, score]) => ({ idx, score }));

    if (kb.rerank_model) {
      const pool = ordered.slice(0, CANDIDATE_POOL);
      try {
        const cfg = await credsFor(
          kb.rerank_provider_id ?? kb.embedding_provider_id,
          kb.rerank_model,
          "rerank",
        );
        const ranked = await rerank({
          ...cfg,
          query,
          documents: pool.map((p) => chunks[p.idx]!.content),
          top_n: limit,
          signal: opts.signal,
        });
        if (ranked.length > 0) {
          ordered = ranked
            .filter((r) => pool[r.index])
            .map((r) => ({ idx: pool[r.index]!.idx, score: r.score }));
        }
      } catch {
        // Reranking is an optimisation; keep the fused order on failure.
      }
    }

    for (const { idx, score } of ordered.slice(0, limit)) {
      const c = chunks[idx]!;
      hits.push({
        kbId: kb.id,
        kbName: kb.name,
        documentId: c.document_id,
        content: c.content,
        score,
      });
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, Math.max(1, Math.min(20, opts.limit ?? 5)));
}
