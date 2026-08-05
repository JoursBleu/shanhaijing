/**
 * Tool registry for the agent loop.
 *
 * A `ToolSpec` is the local, executable side of an OpenAI function tool: it
 * carries the JSON-Schema the model sees plus an `execute` that runs when the
 * model calls it. Built-in tools register at module load; MCP / web / file
 * tools will register here too (P1).
 */

import type { ToolDef } from "./openai";

export interface ToolContext {
  conversationId: string;
  /** The agent whose turn is running (for per-agent memory/skills). */
  agentId?: string;
  signal?: AbortSignal;
  /** Provider credentials of the current turn, for tools that call the model
   *  provider directly (e.g. image generation). */
  provider?: { base_url: string; api_key: string; model: string };
  /** Knowledge bases this agent may search; empty/undefined = all. */
  knowledgeBaseIds?: string[];
}

export type ToolSource = "builtin" | "mcp";

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON-Schema object describing the arguments. */
  parameters: Record<string, unknown>;
  /** Skip the approval prompt for safe, read-only tools. */
  autoApprove?: boolean;
  /** Where the tool came from, so an agent can enable/disable a whole class. */
  source?: ToolSource;
  execute: (args: any, ctx: ToolContext) => Promise<string>;
}

const registry = new Map<string, ToolSpec>();

export function registerTool(spec: ToolSpec): void {
  registry.set(spec.name, { source: "builtin", ...spec });
}

export function getTool(name: string): ToolSpec | undefined {
  return registry.get(name);
}

export function listTools(): ToolSpec[] {
  return [...registry.values()];
}

/** Remove all tools matching a predicate (e.g. dynamic MCP tools before re-init). */
export function clearToolsWhere(pred: (spec: ToolSpec) => boolean): void {
  for (const [name, spec] of registry) {
    if (pred(spec)) registry.delete(name);
  }
}

/** Convert a ToolSpec into the wire-format tool definition for the request. */
export function toToolDef(spec: ToolSpec): ToolDef {
  return {
    type: "function",
    function: {
      name: spec.name,
      description: spec.description,
      parameters: spec.parameters,
    },
  };
}

// ---------------- Built-in tools ----------------
// Safe, dependency-free, read-only. Real tools (web search / fetch / files /
// MCP) register alongside these in P1.

registerTool({
  name: "get_current_datetime",
  description:
    "Get the current local date and time. Use when the user asks what time/date it is or when a calculation needs 'now'.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  autoApprove: true,
  execute: async () => {
    const now = new Date();
    return `Local: ${now.toString()}\nISO: ${now.toISOString()}`;
  },
});
