/**
 * Resolve which tools an agent may call this turn.
 *
 * The registry is global (built-ins register at import, MCP tools register on
 * connect), but an agent's capability surface is not: a roleplay character
 * should not be able to shell out to MCP, and a research assistant should only
 * see the knowledge bases it was given.
 */

import { listTools, type ToolSpec } from "@/llm/tools";
import { listAgentKbIds } from "@/repos/agents";
import { loadExecBackend } from "@/features/execConfig";
import { getSystemAssistantId } from "@/features/systemAssistant";
import type { Agent } from "@/types/domain";

export interface AgentToolConfig {
  tools: ToolSpec[];
  maxRounds: number;
  knowledgeBaseIds: string[];
}

function parseWhitelist(json: string | null): Set<string> | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? new Set(v.map(String)) : null;
  } catch {
    return null;
  }
}

export async function resolveAgentTools(
  agent: Agent,
): Promise<AgentToolConfig> {
  const knowledgeBaseIds = await listAgentKbIds(agent.id);
  const whitelist = parseWhitelist(agent.enabled_tools_json);
  const systemAssistantId = await getSystemAssistantId();

  const tools = listTools().filter((t) => {
    if (t.name.startsWith("shanhaijing_") && agent.id !== systemAssistantId) {
      return false;
    }
    const isMcp = t.source === "mcp";
    if (isMcp) {
      if (agent.mcp_mode === "disabled") return false;
      // `manual` means the agent opted into specific MCP tools by name.
      if (agent.mcp_mode === "manual") return whitelist?.has(t.name) ?? false;
    } else {
      if (agent.tool_mode === "disabled") return false;
    }
    // A whitelist, when present, also narrows auto-mode tools.
    if (whitelist && !isMcp) return whitelist.has(t.name);
    return true;
  });

  // A tool whose prerequisite is missing is hidden rather than left to fail:
  // advertising it only buys a wasted round and a confusing error.
  const unavailable = new Set<string>();
  if (knowledgeBaseIds.length === 0) unavailable.add("search_knowledge");
  if (!(await loadExecBackend())) unavailable.add("run_command");
  const usable = tools.filter((t) => !unavailable.has(t.name));

  return {
    tools: usable,
    maxRounds: Math.max(1, Math.min(30, agent.max_tool_calls || 6)),
    knowledgeBaseIds,
  };
}
