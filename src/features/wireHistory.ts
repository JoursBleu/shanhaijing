/**
 * Turn stored messages into the wire history sent to the model.
 *
 * Visible messages and tool plumbing live in the same table but are stored
 * apart: hidden rows carry `turn_id = <assistant message id>` so a tool round
 * can be re-attached to its owning turn without depending on timestamp
 * ordering (streamed placeholders are inserted before their tool rows exist).
 */

import type { ChatMessage, ToolCall } from "@/llm/openai";
import type { Message } from "@/types/domain";
import { insertMessage } from "@/repos/messages";

/** The `> 🔧 name(args) → result` lines the loop appends for display only. */
const TRACE_LINE = /^> 🔧 .*$/gm;

function stripTrace(content: string): string {
  return content.replace(TRACE_LINE, "").replace(/\n{3,}/g, "\n\n").trim();
}

function parseToolCalls(json: string | null): ToolCall[] | undefined {
  if (!json) return undefined;
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) && v.length > 0 ? (v as ToolCall[]) : undefined;
  } catch {
    return undefined;
  }
}

function toolRowToWire(m: Message): ChatMessage | null {
  if (m.role === "tool") {
    return {
      role: "tool",
      content: m.content,
      tool_call_id: m.tool_call_id ?? m.tool_name ?? "call",
      ...(m.tool_name ? { name: m.tool_name } : {}),
    };
  }
  const tool_calls = parseToolCalls(m.tool_calls_json);
  if (!tool_calls) return null;
  return { role: "assistant", content: m.content, tool_calls };
}

export interface WireHistoryOptions {
  /** Render an assistant message that isn't the current agent as `@name: …`. */
  label?: (m: Message) => string | null;
  /** Treat other agents' turns as user-side input (group chat wire shape). */
  foldAssistantsAsUser?: boolean;
}

/**
 * Build the model-facing history from the visible messages of a conversation,
 * splicing each assistant turn's persisted tool rounds in front of it.
 */
export function buildWireHistory(
  visible: Message[],
  toolRows: Message[],
  opts: WireHistoryOptions = {},
): ChatMessage[] {
  const byTurn = new Map<string, Message[]>();
  for (const row of toolRows) {
    if (!row.turn_id) continue;
    const list = byTurn.get(row.turn_id);
    if (list) list.push(row);
    else byTurn.set(row.turn_id, [row]);
  }

  const out: ChatMessage[] = [];
  for (const m of visible) {
    if (m.role === "system") continue;

    for (const row of byTurn.get(m.id) ?? []) {
      const wire = toolRowToWire(row);
      if (wire) out.push(wire);
    }

    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
      continue;
    }
    const label = opts.label?.(m) ?? null;
    const content = stripTrace(m.content);
    if (!content) continue;
    if (label) {
      out.push({ role: "user", content: `@${label}: ${content}` });
    } else if (opts.foldAssistantsAsUser) {
      out.push({ role: "user", content });
    } else {
      out.push({ role: "assistant", content });
    }
  }
  return out;
}

/** Store a completed turn's tool rounds as hidden rows owned by that turn. */
export async function persistToolMessages(input: {
  conversationId: string;
  turnId: string;
  senderId: string | null;
  messages: ChatMessage[];
}): Promise<void> {
  for (const m of input.messages) {
    await insertMessage({
      conversation_id: input.conversationId,
      role: m.role === "tool" ? "tool" : "assistant",
      sender_id: input.senderId,
      content: m.content,
      turn_id: input.turnId,
      tool_calls_json: m.tool_calls ? JSON.stringify(m.tool_calls) : null,
      tool_call_id: m.tool_call_id ?? null,
      tool_name: m.name ?? null,
      hidden: true,
    });
  }
}
