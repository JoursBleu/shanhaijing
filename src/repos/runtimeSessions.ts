import { getDb } from "@/db";
import type {
  AgentRuntime,
  RuntimeSession,
  RuntimeSessionState,
} from "@/types/domain";

export async function getRuntimeSession(
  conversationId: string,
): Promise<RuntimeSession | null> {
  const db = await getDb();
  const rows = await db.select<RuntimeSession[]>(
    "SELECT * FROM runtime_sessions WHERE conversation_id = ?",
    [conversationId],
  );
  return rows[0] ?? null;
}

export interface UpsertRuntimeSessionInput {
  conversation_id: string;
  runtime: AgentRuntime;
  runtime_session_id: string;
  bridge_protocol_version: number;
  last_event_cursor?: string | null;
  state?: RuntimeSessionState;
}

export async function upsertRuntimeSession(
  input: UpsertRuntimeSessionInput,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO runtime_sessions
       (conversation_id, runtime, runtime_session_id, bridge_protocol_version,
        last_event_cursor, state)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(conversation_id) DO UPDATE SET
       runtime = excluded.runtime,
       runtime_session_id = excluded.runtime_session_id,
       bridge_protocol_version = excluded.bridge_protocol_version,
       last_event_cursor = excluded.last_event_cursor,
       state = excluded.state,
       updated_at = datetime('now')`,
    [
      input.conversation_id,
      input.runtime,
      input.runtime_session_id,
      input.bridge_protocol_version,
      input.last_event_cursor ?? null,
      input.state ?? "ready",
    ],
  );
}

export async function updateRuntimeSessionProgress(
  conversationId: string,
  cursor: string | null,
  state: RuntimeSessionState,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE runtime_sessions
     SET last_event_cursor = ?, state = ?, updated_at = datetime('now')
     WHERE conversation_id = ?`,
    [cursor, state, conversationId],
  );
}

export async function deleteRuntimeSession(
  conversationId: string,
): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM runtime_sessions WHERE conversation_id = ?", [
    conversationId,
  ]);
}