import { getDb } from "@/db";
import { newId } from "@/lib/id";
import type { Agent, McpMode, ToolMode } from "@/types/domain";

function rowToAgent(r: any): Agent {
  return {
    ...r,
    memory_enabled: !!r.memory_enabled,
    tool_mode: (r.tool_mode ?? "auto") as ToolMode,
    mcp_mode: (r.mcp_mode ?? "auto") as McpMode,
    max_tool_calls: r.max_tool_calls ?? 6,
    enabled_tools_json: r.enabled_tools_json ?? null,
  } as Agent;
}

export async function listAgents(): Promise<Agent[]> {
  const db = await getDb();
  const rows = await db.select<any[]>("SELECT * FROM agents ORDER BY created_at");
  return rows.map(rowToAgent);
}

export async function getAgent(id: string): Promise<Agent | null> {
  const db = await getDb();
  const rows = await db.select<any[]>(
    "SELECT * FROM agents WHERE id = ?",
    [id],
  );
  return rows[0] ? rowToAgent(rows[0]) : null;
}

export interface AgentInput {
  name: string;
  avatar_path?: string | null;
  signature?: string;
  default_provider_id?: string | null;
  default_model?: string | null;
  default_temperature?: number;
  default_max_tokens?: number | null;
  default_top_p?: number;
  card_id?: string | null;
  persona_text?: string | null;
  greeting?: string | null;
  memory_enabled?: boolean;
  folder_id?: string | null;
  tool_mode?: ToolMode;
  mcp_mode?: McpMode;
  max_tool_calls?: number;
  enabled_tools_json?: string | null;
}

export async function createAgent(input: AgentInput): Promise<string> {
  const id = newId();
  const db = await getDb();
  await db.execute(
    `INSERT INTO agents
     (id, name, avatar_path, signature, default_provider_id, default_model,
      default_temperature, default_max_tokens, default_top_p, card_id,
      persona_text, greeting, memory_enabled, folder_id,
      tool_mode, mcp_mode, max_tool_calls, enabled_tools_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.avatar_path ?? null,
      input.signature ?? "",
      input.default_provider_id ?? null,
      input.default_model ?? null,
      input.default_temperature ?? 0.7,
      input.default_max_tokens ?? null,
      input.default_top_p ?? 1.0,
      input.card_id ?? null,
      input.persona_text ?? null,
      input.greeting ?? null,
      input.memory_enabled ? 1 : 0,
      input.folder_id ?? null,
      input.tool_mode ?? "auto",
      input.mcp_mode ?? "auto",
      input.max_tool_calls ?? 6,
      input.enabled_tools_json ?? null,
    ],
  );
  return id;
}

export async function updateAgent(
  id: string,
  patch: Partial<AgentInput>,
): Promise<void> {
  const db = await getDb();
  const fields: string[] = [];
  const values: any[] = [];
  for (const [k, v] of Object.entries(patch)) {
    fields.push(`${k} = ?`);
    values.push(k === "memory_enabled" ? (v ? 1 : 0) : v);
  }
  if (!fields.length) return;
  values.push(id);
  await db.execute(
    `UPDATE agents SET ${fields.join(", ")} WHERE id = ?`,
    values,
  );
}

export async function deleteAgent(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM agent_knowledge_bases WHERE agent_id = ?", [id]);
  await db.execute("DELETE FROM agents WHERE id = ?", [id]);
}

// ---- Knowledge base bindings ----

export async function listAgentKbIds(agentId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ kb_id: string }[]>(
    "SELECT kb_id FROM agent_knowledge_bases WHERE agent_id = ? ORDER BY position",
    [agentId],
  );
  return rows.map((r) => r.kb_id);
}

export async function setAgentKbIds(
  agentId: string,
  kbIds: string[],
): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM agent_knowledge_bases WHERE agent_id = ?", [
    agentId,
  ]);
  for (let i = 0; i < kbIds.length; i++) {
    await db.execute(
      "INSERT INTO agent_knowledge_bases (agent_id, kb_id, position) VALUES (?, ?, ?)",
      [agentId, kbIds[i], i],
    );
  }
}
