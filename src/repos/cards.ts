import { getDb } from "@/db";
import { newId } from "@/lib/id";
import type { CharacterCard } from "@/types/domain";

export interface CardInput {
  name: string;
  raw_file_path: string;
  parsed_json: string;
}

export async function listCards(): Promise<CharacterCard[]> {
  const db = await getDb();
  return await db.select<CharacterCard[]>(
    "SELECT * FROM character_cards ORDER BY created_at DESC",
  );
}

export async function getCard(id: string): Promise<CharacterCard | null> {
  const db = await getDb();
  const rows = await db.select<CharacterCard[]>(
    "SELECT * FROM character_cards WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

export async function createCard(input: CardInput): Promise<string> {
  const id = newId();
  const db = await getDb();
  await db.execute(
    `INSERT INTO character_cards (id, name, raw_file_path, parsed_json) VALUES (?, ?, ?, ?)`,
    [id, input.name, input.raw_file_path, input.parsed_json],
  );
  return id;
}

export async function deleteCard(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM character_cards WHERE id = ?", [id]);
}
