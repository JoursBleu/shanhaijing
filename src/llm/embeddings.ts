/**
 * Minimal OpenAI-compatible embeddings client (POST /v1/embeddings).
 *
 * Same raw-fetch approach as `openai.ts` to stay webview-friendly. Works with
 * any provider exposing the OpenAI embeddings shape (硅基流动 / SiliconFlow,
 * OpenAI, Ollama --openai, etc.).
 */

export interface EmbedRequest {
  base_url: string;
  api_key: string;
  model: string;
  input: string[];
  signal?: AbortSignal;
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  if (b.endsWith("/v1") || b.endsWith("/v1beta")) return `${b}${path}`;
  return `${b}/v1${path}`;
}

/** Returns one vector per input string, ordered to match `input`. */
export async function embed(req: EmbedRequest): Promise<number[][]> {
  if (req.input.length === 0) return [];
  const url = joinUrl(req.base_url, "/embeddings");
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (req.api_key) headers["authorization"] = `Bearer ${req.api_key}`;

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: req.model, input: req.input }),
    signal: req.signal,
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`embeddings HTTP ${resp.status}: ${t.slice(0, 300)}`);
  }
  const j: any = await resp.json();
  const data = j?.data;
  if (!Array.isArray(data)) {
    throw new Error("embeddings: malformed response (no data[])");
  }
  return data
    .slice()
    .sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0))
    .map((d: any) => d.embedding as number[]);
}

export function cosineSim(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
