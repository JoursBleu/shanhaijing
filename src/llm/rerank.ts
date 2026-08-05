/**
 * Optional reranking pass (POST /v1/rerank).
 *
 * Vector similarity is recall-oriented: it finds passages that are topically
 * close but often mis-orders them. A cross-encoder reranker scores each
 * (query, passage) pair jointly and fixes the ordering, which is where most of
 * the answer-quality gain in a RAG pipeline comes from.
 *
 * Supported by 硅基流动 / SiliconFlow (BAAI/bge-reranker-v2-m3), Jina, Cohere-
 * compatible gateways. Callers must treat failure as non-fatal and fall back to
 * the pre-rerank order.
 */

export interface RerankRequest {
  base_url: string;
  api_key: string;
  model: string;
  query: string;
  documents: string[];
  top_n?: number;
  signal?: AbortSignal;
}

export interface RerankHit {
  index: number;
  score: number;
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  if (b.endsWith("/v1") || b.endsWith("/v1beta")) return `${b}${path}`;
  return `${b}/v1${path}`;
}

export async function rerank(req: RerankRequest): Promise<RerankHit[]> {
  if (req.documents.length === 0) return [];
  const url = joinUrl(req.base_url, "/rerank");
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (req.api_key) headers["authorization"] = `Bearer ${req.api_key}`;

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: req.model,
      query: req.query,
      documents: req.documents,
      top_n: req.top_n ?? req.documents.length,
    }),
    signal: req.signal,
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`rerank HTTP ${resp.status}: ${t.slice(0, 300)}`);
  }
  const j: any = await resp.json();
  const results = j?.results ?? j?.data;
  if (!Array.isArray(results)) {
    throw new Error("rerank: malformed response (no results[])");
  }
  return results
    .map((r: any) => ({
      index: Number(r.index ?? r.document_index ?? 0),
      score: Number(r.relevance_score ?? r.score ?? 0),
    }))
    .filter((r: RerankHit) => Number.isFinite(r.index))
    .sort((a: RerankHit, b: RerankHit) => b.score - a.score);
}
