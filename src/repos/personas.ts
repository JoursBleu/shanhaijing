import { getDb } from "@/db";
import { newId } from "@/lib/id";
import type { UserPersona } from "@/types/domain";

export async function listPersonas(): Promise<UserPersona[]> {
  const db = await getDb();
  return db.select<UserPersona[]>(
    "SELECT * FROM user_personas ORDER BY created_at",
  );
}

export async function getPersona(id: string): Promise<UserPersona | null> {
  const db = await getDb();
  const rows = await db.select<UserPersona[]>(
    "SELECT * FROM user_personas WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

export async function createPersona(input: {
  name: string;
  avatar_path?: string | null;
  bio?: string;
}): Promise<string> {
  const id = newId();
  const db = await getDb();
  await db.execute(
    `INSERT INTO user_personas (id, name, avatar_path, bio)
     VALUES (?, ?, ?, ?)`,
    [id, input.name, input.avatar_path ?? null, input.bio ?? ""],
  );
  return id;
}

export async function updatePersona(
  id: string,
  patch: Partial<{ name: string; avatar_path: string | null; bio: string }>,
): Promise<void> {
  const db = await getDb();
  const fields: string[] = [];
  const values: any[] = [];
  for (const [k, v] of Object.entries(patch)) {
    fields.push(`${k} = ?`);
    values.push(v);
  }
  if (!fields.length) return;
  values.push(id);
  await db.execute(
    `UPDATE user_personas SET ${fields.join(", ")} WHERE id = ?`,
    values,
  );
}

export async function deletePersona(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM user_personas WHERE id = ?", [id]);
}
