import { getDb } from "@/db";
import { newId } from "@/lib/id";
import type { Message, MessageRole } from "@/types/domain";

export interface InsertMessageInput {
  conversation_id: string;
  role: MessageRole;
  sender_id: string | null;
  content: string;
  parent_id?: string | null;
  mentioned_agent_ids?: string[];
  in_reply_to_message_id?: string | null;
}

export async function insertMessage(
  input: InsertMessageInput,
): Promise<string> {
  const id = newId();
  const db = await getDb();
  await db.execute(
    `INSERT INTO messages
     (id, conversation_id, role, sender_id, parent_id, content,
      mentioned_agent_ids, in_reply_to_message_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.conversation_id,
      input.role,
      input.sender_id,
      input.parent_id ?? null,
      input.content,
      JSON.stringify(input.mentioned_agent_ids ?? []),
      input.in_reply_to_message_id ?? null,
    ],
  );
  await db.execute(
    `UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`,
    [input.conversation_id],
  );
  return id;
}

export async function updateMessageContent(
  id: string,
  content: string,
  tokens?: { tokens_in?: number; tokens_out?: number; cost_cents?: number },
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE messages
     SET content = ?, tokens_in = ?, tokens_out = ?, cost_cents = ?
     WHERE id = ?`,
    [
      content,
      tokens?.tokens_in ?? null,
      tokens?.tokens_out ?? null,
      tokens?.cost_cents ?? null,
      id,
    ],
  );
}

export async function listMessages(
  conversationId: string,
): Promise<Message[]> {
  const db = await getDb();
  return db.select<Message[]>(
    "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at, id",
    [conversationId],
  );
}

export async function deleteMessage(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM messages WHERE id = ?", [id]);
}
