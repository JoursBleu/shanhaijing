import { getDb } from "@/db";
import { newId } from "@/lib/id";
import type { Folder, FolderKind } from "@/types/domain";

export async function listFolders(kind: FolderKind): Promise<Folder[]> {
  const db = await getDb();
  return db.select<Folder[]>(
    "SELECT * FROM folders WHERE kind = ? ORDER BY position, name",
    [kind],
  );
}

export async function createFolder(kind: FolderKind, name: string): Promise<string> {
  const id = newId();
  const db = await getDb();
  await db.execute(
    "INSERT INTO folders (id, kind, name) VALUES (?, ?, ?)",
    [id, kind, name],
  );
  return id;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE folders SET name = ? WHERE id = ?", [name, id]);
}

export async function deleteFolder(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM folders WHERE id = ?", [id]);
}

export async function setConversationFolder(
  conversationId: string,
  folderId: string | null,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE conversations SET folder_id = ?, updated_at = datetime('now') WHERE id = ?",
    [folderId, conversationId],
  );
}
