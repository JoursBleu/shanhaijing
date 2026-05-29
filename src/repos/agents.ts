import { getDb } from "@/db";
import { newId } from "@/lib/id";
import type { Agent } from "@/types/domain";

function rowToAgent(r: any): Agent {
  return { ...r, memory_enabled: !!r.memory_enabled } as Agent;
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
}

export async function createAgent(input: AgentInput): Promise<string> {
  const id = newId();
  const db = await getDb();
  await db.execute(
    `INSERT INTO agents
     (id, name, avatar_path, signature, default_provider_id, default_model,
      default_temperature, default_max_tokens, default_top_p, card_id,
      persona_text, greeting, memory_enabled, folder_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  await db.execute("DELETE FROM agents WHERE id = ?", [id]);
}
