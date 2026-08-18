import Database from "@tauri-apps/plugin-sql";

const DB_URL = "sqlite:shanhaijing.db";

let _db: Database | null = null;
let _dbPromise: Promise<Database> | null = null;

export async function getDb(): Promise<Database> {
  if (_db) return _db;
  if (!_dbPromise) {
    _dbPromise = Database.load(DB_URL)
      .then((db) => {
        _db = db;
        return db;
      })
      .catch((error) => {
        _dbPromise = null;
        throw error;
      });
  }
  return _dbPromise;
}

export async function ensureSchema(): Promise<void> {
  await getDb();
}
