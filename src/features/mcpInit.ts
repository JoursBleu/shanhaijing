/**
 * Connect all enabled MCP servers and register their tools into the agent tool
 * registry. Called (fire-and-forget) at bootstrap and re-run when the MCP
 * settings panel changes servers.
 */

import { listMcpServers } from "@/repos/mcpServers";
import { connectAndRegisterServer } from "@/llm/mcp";
import { clearToolsWhere } from "@/llm/tools";

export interface McpStatus {
  serverId: string;
  name: string;
  ok: boolean;
  count: number;
  error?: string;
}

let lastStatus: McpStatus[] = [];

export function getMcpStatus(): McpStatus[] {
  return lastStatus;
}

export async function initMcp(): Promise<McpStatus[]> {
  // Drop previously-registered MCP tools so removed/disabled servers don't linger.
  clearToolsWhere((t) => t.name.startsWith("mcp__"));

  const servers = (await listMcpServers()).filter((s) => s.enabled);
  const status: McpStatus[] = [];
  for (const s of servers) {
    const r = await connectAndRegisterServer(s);
    status.push({
      serverId: s.id,
      name: s.name,
      ok: r.ok,
      count: r.count,
      error: r.error,
    });
  }
  lastStatus = status;
  return status;
}
