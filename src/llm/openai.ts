/**
 * Minimal OpenAI-compatible streaming client.
 *
 * Uses raw fetch + SSE parsing instead of the openai npm package to avoid
 * Node/browser polyfill issues inside the Tauri webview. Works with any
 * provider that implements the /v1/chat/completions streaming protocol
 * (硅基流动, 火山方舟, DeepSeek, Ollama with --openai, etc.).
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  /** assistant turns that invoke tools */
  tool_calls?: ToolCall[];
  /** tool-result messages reference the originating call */
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** OpenAI function-tool definition sent in the request. */
export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatRequest {
  base_url: string;
  api_key: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number | null;
  tools?: ToolDef[];
  tool_choice?: "auto" | "none" | "required";
  signal?: AbortSignal;
}

/** A streamed tool_call fragment: id/name arrive on the first delta, arguments accumulate. */
export interface ToolCallDelta {
  index: number;
  id?: string;
  name?: string;
  argumentsFragment?: string;
}

export interface ChatChunk {
  delta: string;
  done: boolean;
  toolCalls?: ToolCallDelta[];
  finishReason?: string;
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
  if (req.tools && req.tools.length > 0) {
    body.tools = req.tools;
    body.tool_choice = req.tool_choice ?? "auto";
  }

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
        const choice = j.choices?.[0];
        const d = choice?.delta;
        const textDelta = typeof d?.content === "string" ? d.content : "";
        const rawToolCalls = Array.isArray(d?.tool_calls) ? d.tool_calls : null;
        const toolCalls: ToolCallDelta[] | undefined = rawToolCalls
          ? rawToolCalls.map((tc: any) => ({
              index: typeof tc.index === "number" ? tc.index : 0,
              id: tc.id,
              name: tc.function?.name,
              argumentsFragment: tc.function?.arguments,
            }))
          : undefined;
        const finishReason: string | undefined = choice?.finish_reason ?? undefined;
        if (textDelta || toolCalls || finishReason) {
          yield { delta: textDelta, done: false, toolCalls, finishReason, raw: j };
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
