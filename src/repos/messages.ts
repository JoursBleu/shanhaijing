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
  variant_group_id?: string | null;
  variant_index?: number;
}

export async function insertMessage(
  input: InsertMessageInput,
): Promise<string> {
  const id = newId();
  const db = await getDb();
  // For assistant messages we default variant_group_id to the message id
  // (i.e. it is its own first variant); regenerate reuses the same group id
  // with an incremented variant_index.
  const groupId =
    input.variant_group_id ?? (input.role === "assistant" ? id : null);
  await db.execute(
    `INSERT INTO messages
     (id, conversation_id, role, sender_id, parent_id, content,
      mentioned_agent_ids, in_reply_to_message_id,
      variant_group_id, variant_index)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.conversation_id,
      input.role,
      input.sender_id,
      input.parent_id ?? null,
      input.content,
      JSON.stringify(input.mentioned_agent_ids ?? []),
      input.in_reply_to_message_id ?? null,
      groupId,
      input.variant_index ?? 0,
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
  if (tokens) {
    await db.execute(
      `UPDATE messages
       SET content = ?, tokens_in = ?, tokens_out = ?, cost_cents = ?
       WHERE id = ?`,
      [
        content,
        tokens.tokens_in ?? null,
        tokens.tokens_out ?? null,
        tokens.cost_cents ?? null,
        id,
      ],
    );
  } else {
    await db.execute("UPDATE messages SET content = ? WHERE id = ?", [
      content,
      id,
    ]);
  }
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

/**
 * List variants for a given group (sorted by variant_index ASC).
 */
export async function listVariants(
  groupId: string,
): Promise<Message[]> {
  const db = await getDb();
  return db.select<Message[]>(
    "SELECT * FROM messages WHERE variant_group_id = ? ORDER BY variant_index, created_at",
    [groupId],
  );
}

export async function deleteMessage(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM messages WHERE id = ?", [id]);
}

/**
 * Delete messages strictly after a given created_at within a conversation.
 * Used when the user edits a message and wants to truncate downstream history.
 */
export async function deleteMessagesAfter(
  conversationId: string,
  createdAt: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM messages WHERE conversation_id = ? AND created_at > ?",
    [conversationId, createdAt],
  );
}

/**
 * Naive case-insensitive LIKE search across messages, scoped to a conversation
 * or globally. Returns matches in reverse chronological order, limited.
 */
export interface SearchHit {
  message_id: string;
  conversation_id: string;
  conversation_title: string;
  role: MessageRole;
  content: string;
  created_at: string;
}

export async function searchMessages(
  query: string,
  opts: { conversationId?: string; limit?: number } = {},
): Promise<SearchHit[]> {
  if (!query.trim()) return [];
  const db = await getDb();
  const pattern = `%${query.trim().replace(/[%_]/g, (m) => "\\" + m)}%`;
  const limit = opts.limit ?? 50;
  if (opts.conversationId) {
    return db.select<SearchHit[]>(
      `SELECT m.id AS message_id, m.conversation_id, c.title AS conversation_title,
              m.role, m.content, m.created_at
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.conversation_id = ?
         AND m.content LIKE ? ESCAPE '\\'
       ORDER BY m.created_at DESC
       LIMIT ?`,
      [opts.conversationId, pattern, limit],
    );
  }
  return db.select<SearchHit[]>(
    `SELECT m.id AS message_id, m.conversation_id, c.title AS conversation_title,
            m.role, m.content, m.created_at
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     WHERE m.content LIKE ? ESCAPE '\\'
     ORDER BY m.created_at DESC
     LIMIT ?`,
    [pattern, limit],
  );
}
