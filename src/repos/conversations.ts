import { getDb } from "@/db";
import { newId } from "@/lib/id";
import type {
  Conversation,
  ConversationAgent,
  ConversationKind,
} from "@/types/domain";

function rowToConv(r: any): Conversation {
  return r as Conversation;
}

export interface CreateConversationInput {
  kind: ConversationKind;
  title?: string;
  user_persona_id: string;
  agent_ids: string[];
  task_goal?: string | null;
  cost_limit_cents?: number | null;
  initial_responder?: string | null;
  max_total_turns?: number | null;
  max_per_agent_turns?: number | null;
}

export async function createConversation(
  input: CreateConversationInput,
): Promise<string> {
  // iron law: user_persona_id is required.
  if (!input.user_persona_id) {
    throw new Error(
      "Cannot create a conversation without a user persona (principle 2).",
    );
  }
  if (input.kind === "private" && input.agent_ids.length !== 1) {
    throw new Error("Private conversations need exactly one agent.");
  }
  if (input.kind !== "private" && input.agent_ids.length < 2) {
    throw new Error("Group conversations need at least two agents.");
  }

  const id = newId();
  const db = await getDb();
  await db.execute(
    `INSERT INTO conversations
     (id, kind, title, user_persona_id, task_goal, task_status,
      cost_limit_cents, initial_responder, max_total_turns, max_per_agent_turns)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.kind,
      input.title ?? "",
      input.user_persona_id,
      input.task_goal ?? null,
      input.kind === "work" ? "open" : null,
      input.cost_limit_cents ?? null,
      input.initial_responder ?? input.agent_ids[0] ?? null,
      input.max_total_turns ?? null,
      input.max_per_agent_turns ?? null,
    ],
  );
  for (const aid of input.agent_ids) {
    await db.execute(
      `INSERT INTO conversation_agents (conversation_id, agent_id)
       VALUES (?, ?)`,
      [id, aid],
    );
  }
  return id;
}

export async function listConversations(): Promise<Conversation[]> {
  const db = await getDb();
  const rows = await db.select<any[]>(
    "SELECT * FROM conversations ORDER BY updated_at DESC",
  );
  return rows.map(rowToConv);
}

export async function getConversation(
  id: string,
): Promise<Conversation | null> {
  const db = await getDb();
  const rows = await db.select<any[]>(
    "SELECT * FROM conversations WHERE id = ?",
    [id],
  );
  return rows[0] ? rowToConv(rows[0]) : null;
}

export async function listConversationAgents(
  conversationId: string,
): Promise<ConversationAgent[]> {
  const db = await getDb();
  return db.select<ConversationAgent[]>(
    "SELECT * FROM conversation_agents WHERE conversation_id = ?",
    [conversationId],
  );
}

export async function updateConversationTitle(
  id: string,
  title: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?`,
    [title, id],
  );
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
