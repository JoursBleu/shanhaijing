/**
 * Agent turn runner (P0 foundation for the agent-app layer).
 *
 * Runs one user-visible assistant turn that may span multiple model rounds:
 *   stream assistant → if it emits tool_calls → execute (with approval) →
 *   feed results back → stream again → … until the model answers with no
 *   tool calls (or maxRounds is hit).
 *
 * Backward compatible: when no tools are registered/available, this is a single
 * streamed round identical to the old behaviour. If the provider/model rejects
 * `tools` (e.g. a non-tool Ollama model), the first round degrades to a plain
 * (toolless) call automatically so existing chats never regress.
 */

import {
  streamChat,
  type ChatMessage,
  type ToolCall,
} from "@/llm/openai";
import { listTools, toToolDef, type ToolSpec } from "@/llm/tools";

export interface ToolEvent {
  kind: "call" | "result" | "denied" | "error";
  name: string;
  args?: unknown;
  output?: string;
}

export interface AgentTurnInput {
  base_url: string;
  api_key: string;
  model: string;
  /** system + history + the new user message, already assembled by the caller. */
  messages: ChatMessage[];
  /** Available tools; defaults to the global registry. Pass [] to disable. */
  tools?: ToolSpec[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number | null;
  maxRounds?: number;
  signal?: AbortSignal;
  conversationId: string;
  /** The agent whose turn this is (for per-agent memory/skill tools). */
  agentId?: string;
  /** Knowledge bases the agent is allowed to search this turn. */
  knowledgeBaseIds?: string[];
  /** Called with the full display string (streamed text + tool trace) as it grows. */
  onText: (full: string) => void;
  onToolEvent?: (e: ToolEvent) => void;
  /** Resolve true to run a non-auto-approve tool. Missing approval fails closed. */
  approve?: (call: { name: string; args: unknown }) => Promise<boolean>;
}

export interface AgentTurnResult {
  /** Full assistant message to persist (final text plus an inline tool trace). */
  text: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  rounds: number;
  toolTrace: ToolEvent[];
  /** The assistant/tool rounds this turn appended, for structured persistence. */
  toolMessages: ChatMessage[];
}

function compact(value: unknown, max = 80): string {
  let s: string;
  try {
    s = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    s = String(value);
  }
  if (!s || s === "{}") return "";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function truncate(s: string, max = 240): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? oneLine.slice(0, max) + "…" : oneLine;
}

export async function runAgentTurn(
  input: AgentTurnInput,
): Promise<AgentTurnResult> {
  const tools = input.tools ?? listTools();
  const executableTools = new Map(tools.map((tool) => [tool.name, tool]));
  const toolDefs = tools.length > 0 ? tools.map(toToolDef) : undefined;
  const wire: ChatMessage[] = [...input.messages];
  const trace: ToolEvent[] = [];
  const maxRounds = input.maxRounds ?? 6;

  let committed = ""; // text + tool trace from completed rounds
  let usage: AgentTurnResult["usage"];
  let useTools = !!toolDefs;
  let degraded = false;

  for (let round = 0; round < maxRounds; round++) {
    let roundText = "";
    const accum = new Map<number, { id: string; name: string; args: string }>();

    try {
      for await (const chunk of streamChat({
        base_url: input.base_url,
        api_key: input.api_key,
        model: input.model,
        messages: wire,
        tools: useTools ? toolDefs : undefined,
        temperature: input.temperature,
        top_p: input.top_p,
        max_tokens: input.max_tokens,
        signal: input.signal,
      })) {
        if (chunk.usage) usage = chunk.usage;
        if (chunk.delta) {
          roundText += chunk.delta;
          input.onText(committed + roundText);
        }
        if (chunk.toolCalls) {
          for (const tc of chunk.toolCalls) {
            const cur = accum.get(tc.index) ?? { id: "", name: "", args: "" };
            if (tc.id) cur.id = tc.id;
            if (tc.name) cur.name = tc.name;
            if (tc.argumentsFragment) cur.args += tc.argumentsFragment;
            accum.set(tc.index, cur);
          }
        }
      }
    } catch (e) {
      // Provider may reject `tools`; degrade once to a plain call and retry.
      if (useTools && !degraded) {
        useTools = false;
        degraded = true;
        round--;
        continue;
      }
      throw e;
    }

    const calls = [...accum.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => v)
      .filter((c) => c.name);

    if (calls.length === 0) {
      committed += roundText;
      return {
        text: committed,
        usage,
        rounds: round + 1,
        toolTrace: trace,
        toolMessages: wire.slice(input.messages.length),
      };
    }

    // Record the assistant's tool-call turn in the wire history.
    const toolCalls: ToolCall[] = calls.map((c) => ({
      id: c.id || c.name,
      type: "function",
      function: { name: c.name, arguments: c.args || "{}" },
    }));
    wire.push({ role: "assistant", content: roundText, tool_calls: toolCalls });
    if (roundText.trim()) committed += roundText + "\n\n";

    for (const c of calls) {
      let args: unknown = {};
      try {
        args = c.args ? JSON.parse(c.args) : {};
      } catch {
        args = {};
      }
      // Execution uses the exact capability set resolved for this turn. Never
      // fall back to the global registry: a model may fabricate a registered
      // tool name that was intentionally not advertised to this agent.
      const spec = executableTools.get(c.name);
      let output: string;

      if (!spec) {
        output = `Error: unknown tool "${c.name}"`;
        trace.push({ kind: "error", name: c.name, args, output });
        input.onToolEvent?.({ kind: "error", name: c.name, args, output });
      } else {
        const approved =
          spec.autoApprove === true ||
          (input.approve !== undefined &&
            (await input.approve({ name: c.name, args })));
        if (!approved) {
          output = "Tool call denied by the user.";
          trace.push({ kind: "denied", name: c.name, args });
          input.onToolEvent?.({ kind: "denied", name: c.name, args });
        } else {
          input.onToolEvent?.({ kind: "call", name: c.name, args });
          try {
            output = await spec.execute(args, {
              conversationId: input.conversationId,
              agentId: input.agentId,
              signal: input.signal,
              knowledgeBaseIds: input.knowledgeBaseIds,
              provider: {
                base_url: input.base_url,
                api_key: input.api_key,
                model: input.model,
              },
            });
            trace.push({ kind: "result", name: c.name, args, output });
            input.onToolEvent?.({ kind: "result", name: c.name, args, output });
          } catch (e: any) {
            output = `Error: ${e?.message ?? e}`;
            trace.push({ kind: "error", name: c.name, args, output });
            input.onToolEvent?.({ kind: "error", name: c.name, args, output });
          }
        }
      }

      wire.push({ role: "tool", content: output, tool_call_id: c.id || c.name });
      const argStr = compact(args);
      if (output.startsWith("![")) {
        // Image result: show the note, then render the image below the trace.
        committed += `> 🔧 \`${c.name}(${argStr})\`\n\n${output}\n\n`;
      } else {
        committed += `> 🔧 \`${c.name}(${argStr})\` → ${truncate(output)}\n\n`;
      }
      input.onText(committed);
    }
  }

  committed += "*[已达到工具调用轮数上限]*";
  return {
    text: committed,
    usage,
    rounds: maxRounds,
    toolTrace: trace,
    toolMessages: wire.slice(input.messages.length),
  };
}
