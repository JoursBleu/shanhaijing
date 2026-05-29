/**
 * Minimal OpenAI-compatible streaming client.
 *
 * Uses raw fetch + SSE parsing instead of the openai npm package to avoid
 * Node/browser polyfill issues inside the Tauri webview. Works with any
 * provider that implements the /v1/chat/completions streaming protocol
 * (硅基流动, 火山方舟, DeepSeek, Ollama with --openai, etc.).
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  name?: string;
}

export interface ChatRequest {
  base_url: string;
  api_key: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number | null;
  signal?: AbortSignal;
}

export interface ChatChunk {
  delta: string;
  done: boolean;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  raw?: any;
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  if (b.endsWith("/v1") || b.endsWith("/v1beta")) return `${b}${path}`;
  return `${b}/v1${path}`;
}

export async function* streamChat(req: ChatRequest): AsyncGenerator<ChatChunk> {
  const url = joinUrl(req.base_url, "/chat/completions");
  const body: any = {
    model: req.model,
    messages: req.messages,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.top_p !== undefined) body.top_p = req.top_p;
  if (req.max_tokens) body.max_tokens = req.max_tokens;

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (req.api_key) headers["authorization"] = `Bearer ${req.api_key}`;

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: req.signal,
  });

  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => "");
    throw new Error(`HTTP ${resp.status}: ${text || resp.statusText}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let usage: any = undefined;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") {
        yield { delta: "", done: true, usage };
        return;
      }
      try {
        const j = JSON.parse(data);
        if (j.usage) usage = j.usage;
        const delta = j.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          yield { delta, done: false, raw: j };
        }
      } catch {
        // ignore malformed chunk
      }
    }
  }
  yield { delta: "", done: true, usage };
}

export interface ListModelsArgs {
  base_url: string;
  api_key: string;
}

export async function listRemoteModels(
  args: ListModelsArgs,
): Promise<{ id: string }[]> {
  const url = joinUrl(args.base_url, "/models");
  const headers: Record<string, string> = {};
  if (args.api_key) headers["authorization"] = `Bearer ${args.api_key}`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
  }
  const j = await resp.json();
  if (Array.isArray(j.data)) return j.data;
  if (Array.isArray(j.models)) return j.models;
  if (Array.isArray(j)) return j;
  return [];
}
