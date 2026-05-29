import Database from "@tauri-apps/plugin-sql";

const DB_URL = "sqlite:shanhaijing.db";

let _db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (_db) return _db;
  _db = await Database.load(DB_URL);
  return _db;
}

export async function ensureSchema(): Promise<void> {
  await getDb();
}
