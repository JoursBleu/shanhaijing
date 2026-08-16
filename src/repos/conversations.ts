import { getDb } from "@/db";
import { newId } from "@/lib/id";
import type { Conversation } from "@/types/domain";

export interface CreateConversationInput {
  agent_id: string;
  title?: string;
  folder_id?: string | null;
  /** Overrides of the agent's defaults, scoped to this conversation. */
  provider_id?: string | null;
  model?: string | null;
  temperature?: number | null;
  max_tokens?: number | null;
  top_p?: number | null;
}

export async function createConversation(
  input: CreateConversationInput,
): Promise<string> {
  if (!input.agent_id) {
    throw new Error("Cannot create a conversation without an agent.");
  }
  const id = newId();
  const db = await getDb();
  const agents = await db.select<{ runtime: Conversation["runtime"] }[]>(
    "SELECT runtime FROM agents WHERE id = ?",
    [input.agent_id],
  );
  if (!agents[0]) {
    throw new Error("Cannot create a conversation for a missing agent.");
  }
  await db.execute(
    `INSERT INTO conversations
     (id, title, agent_id, folder_id, provider_id, model, temperature,
      max_tokens, top_p, runtime)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.title ?? "",
      input.agent_id,
      input.folder_id ?? null,
      input.provider_id ?? null,
      input.model ?? null,
      input.temperature ?? null,
      input.max_tokens ?? null,
      input.top_p ?? null,
      agents[0].runtime,
    ],
  );
  return id;
}

export async function listConversations(): Promise<Conversation[]> {
  const db = await getDb();
  return db.select<Conversation[]>(
    "SELECT * FROM conversations ORDER BY updated_at DESC",
  );
}

export async function getConversation(
  id: string,
): Promise<Conversation | null> {
  const db = await getDb();
  const rows = await db.select<Conversation[]>(
    "SELECT * FROM conversations WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

export async function updateConversation(
  id: string,
  patch: Partial<Omit<Conversation, "id" | "created_at" | "updated_at">>,
): Promise<void> {
  const entries = Object.entries(patch);
  if (entries.length === 0) return;
  const db = await getDb();
  await db.execute(
    `UPDATE conversations SET ${entries.map(([k]) => `${k} = ?`).join(", ")},
     updated_at = datetime('now') WHERE id = ?`,
    [...entries.map(([, v]) => v), id],
  );
}

export async function updateConversationTitle(
  id: string,
  title: string,
): Promise<void> {
  await updateConversation(id, { title });
}

export async function setConversationFolder(
  id: string,
  folderId: string | null,
): Promise<void> {
  await updateConversation(id, { folder_id: folderId });
}

export async function touchConversation(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`,
    [id],
  );
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM conversations WHERE id = ?", [id]);
}
