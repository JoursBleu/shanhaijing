/**
 * Full-app backup: snapshot every table to a JSON document, restore it back,
 * and optionally sync that document to a WebDAV server.
 *
 * A row-level JSON snapshot is used rather than copying the SQLite file so a
 * backup taken on one schema version can still be restored after a migration —
 * unknown columns are dropped and missing ones fall back to their defaults.
 *
 * Restore is destructive by design (wipe-then-insert): merging two divergent
 * local-first databases has no correct answer without conflict resolution the
 * app does not have, so the user picks a winner explicitly.
 */

import { getDb } from "@/db";
import { getSetting, setSetting } from "@/repos/settings";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

/** Order matters on restore: parents before the rows that reference them. */
const TABLES = [
  "providers",
  "models",
  "user_personas",
  "character_cards",
  "skills",
  "folders",
  "agents",
  "agent_skills",
  "agent_knowledge_bases",
  "conversations",
  "conversation_agents",
  "messages",
  "memories",
  "mcp_servers",
  "knowledge_bases",
  "kb_documents",
  "kb_chunks",
  "app_settings",
] as const;

/** Never leave the machine: install-local key material and transient UI state. */
const EXCLUDED_SETTING_KEYS = ["webdav.password"];

export const BACKUP_FORMAT = 2;

export interface BackupFile {
  format: number;
  app: "shanhaijing";
  created_at: string;
  tables: Record<string, Record<string, unknown>[]>;
}

export interface BackupStats {
  tables: number;
  rows: number;
}

export async function createBackup(): Promise<BackupFile> {
  const db = await getDb();
  const tables: BackupFile["tables"] = {};
  for (const t of TABLES) {
    try {
      let rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${t}`);
      if (t === "app_settings") {
        rows = rows.filter(
          (r) => !EXCLUDED_SETTING_KEYS.includes(String(r.key)),
        );
      }
      tables[t] = rows;
    } catch {
      // Table absent on this schema version; a partial backup beats no backup.
    }
  }
  return {
    format: BACKUP_FORMAT,
    app: "shanhaijing",
    created_at: new Date().toISOString(),
    tables,
  };
}

export function backupStats(b: BackupFile): BackupStats {
  const entries = Object.values(b.tables);
  return {
    tables: entries.length,
    rows: entries.reduce((n, rows) => n + rows.length, 0),
  };
}

export async function restoreBackup(backup: BackupFile): Promise<BackupStats> {
  if (backup.app !== "shanhaijing" || !backup.tables) {
    throw new Error("不是山海经备份文件");
  }
  const db = await getDb();

  // Children first so foreign rows never outlive their parents mid-restore.
  for (const t of [...TABLES].reverse()) {
    try {
      await db.execute(`DELETE FROM ${t}`);
    } catch {
      // Table doesn't exist here; nothing to clear.
    }
  }

  let rowCount = 0;
  for (const t of TABLES) {
    const rows = backup.tables[t];
    if (!rows?.length) continue;
    const columns = await tableColumns(t);
    for (const row of rows) {
      // Only restore columns this schema version still has.
      const cols = Object.keys(row).filter((c) => columns.has(c));
      if (cols.length === 0) continue;
      await db.execute(
        `INSERT OR REPLACE INTO ${t} (${cols.join(", ")})
         VALUES (${cols.map(() => "?").join(", ")})`,
        cols.map((c) => row[c] ?? null),
      );
      rowCount++;
    }
  }
  return { tables: Object.keys(backup.tables).length, rows: rowCount };
}

async function tableColumns(table: string): Promise<Set<string>> {
  const db = await getDb();
  try {
    const info = await db.select<{ name: string }[]>(
      `PRAGMA table_info(${table})`,
    );
    return new Set(info.map((c) => c.name));
  } catch {
    return new Set();
  }
}

// ---- WebDAV ----

export interface WebdavConfig {
  url: string;
  username: string;
  password: string;
  /** Remote directory, e.g. `/shanhaijing`. */
  path: string;
}

const K = {
  url: "webdav.url",
  username: "webdav.username",
  password: "webdav.password",
  path: "webdav.path",
};

export async function loadWebdavConfig(): Promise<WebdavConfig> {
  const enc = await getSetting(K.password);
  return {
    url: (await getSetting(K.url)) ?? "",
    username: (await getSetting(K.username)) ?? "",
    password: enc ? await decryptSecret(enc) : "",
    path: (await getSetting(K.path)) ?? "/shanhaijing",
  };
}

export async function saveWebdavConfig(cfg: WebdavConfig): Promise<void> {
  await setSetting(K.url, cfg.url.trim());
  await setSetting(K.username, cfg.username.trim());
  await setSetting(K.password, await encryptSecret(cfg.password));
  await setSetting(K.path, normalizeDir(cfg.path));
}

function normalizeDir(p: string): string {
  const s = `/${p.trim().replace(/^\/+|\/+$/g, "")}`;
  return s === "/" ? "" : s;
}

function remoteUrl(cfg: WebdavConfig, name = ""): string {
  const base = cfg.url.trim().replace(/\/+$/, "");
  return `${base}${normalizeDir(cfg.path)}${name ? `/${name}` : ""}`;
}

function authHeader(cfg: WebdavConfig): Record<string, string> {
  if (!cfg.username && !cfg.password) return {};
  return { authorization: `Basic ${btoa(`${cfg.username}:${cfg.password}`)}` };
}

async function ensureRemoteDir(cfg: WebdavConfig): Promise<void> {
  if (!normalizeDir(cfg.path)) return;
  const resp = await fetch(remoteUrl(cfg), {
    method: "MKCOL",
    headers: authHeader(cfg),
  });
  // 405/301 mean it already exists, which is the expected steady state.
  if (!resp.ok && ![301, 405, 409].includes(resp.status)) {
    throw new Error(`创建远程目录失败：HTTP ${resp.status}`);
  }
}

export function backupFilename(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `shanhaijing-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.json`;
}

export async function uploadBackup(
  cfg: WebdavConfig,
  backup: BackupFile,
): Promise<string> {
  if (!cfg.url.trim()) throw new Error("请先填写 WebDAV 地址");
  await ensureRemoteDir(cfg);
  const name = backupFilename();
  const resp = await fetch(remoteUrl(cfg, name), {
    method: "PUT",
    headers: { ...authHeader(cfg), "content-type": "application/json" },
    body: JSON.stringify(backup),
  });
  if (!resp.ok) throw new Error(`上传失败：HTTP ${resp.status}`);
  return name;
}

export interface RemoteBackup {
  name: string;
  size: number | null;
  modified: string | null;
}

export async function listRemoteBackups(
  cfg: WebdavConfig,
): Promise<RemoteBackup[]> {
  if (!cfg.url.trim()) throw new Error("请先填写 WebDAV 地址");
  const resp = await fetch(remoteUrl(cfg), {
    method: "PROPFIND",
    headers: { ...authHeader(cfg), depth: "1" },
  });
  if (!resp.ok) throw new Error(`列出失败：HTTP ${resp.status}`);
  return parsePropfind(await resp.text());
}

/** WebDAV multistatus XML → the shanhaijing-*.json entries in it. */
function parsePropfind(xml: string): RemoteBackup[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const out: RemoteBackup[] = [];
  // Servers vary between `D:`, `d:` and no prefix, so match on local name.
  for (const resp of Array.from(doc.getElementsByTagNameNS("*", "response"))) {
    const href = local(resp, "href");
    if (!href) continue;
    const name = decodeURIComponent(href.replace(/\/+$/, "").split("/").pop() ?? "");
    if (!/^shanhaijing-.*\.json$/.test(name)) continue;
    const len = local(resp, "getcontentlength");
    out.push({
      name,
      size: len ? Number(len) : null,
      modified: local(resp, "getlastmodified"),
    });
  }
  return out.sort((a, b) => b.name.localeCompare(a.name));
}

function local(el: Element, tag: string): string | null {
  const found = el.getElementsByTagNameNS("*", tag)[0];
  return found?.textContent?.trim() || null;
}

export async function downloadBackup(
  cfg: WebdavConfig,
  name: string,
): Promise<BackupFile> {
  const resp = await fetch(remoteUrl(cfg, name), {
    method: "GET",
    headers: authHeader(cfg),
  });
  if (!resp.ok) throw new Error(`下载失败：HTTP ${resp.status}`);
  return (await resp.json()) as BackupFile;
}

export async function deleteRemoteBackup(
  cfg: WebdavConfig,
  name: string,
): Promise<void> {
  const resp = await fetch(remoteUrl(cfg, name), {
    method: "DELETE",
    headers: authHeader(cfg),
  });
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`删除失败：HTTP ${resp.status}`);
  }
}

export async function testWebdav(cfg: WebdavConfig): Promise<void> {
  const resp = await fetch(remoteUrl(cfg), {
    method: "PROPFIND",
    headers: { ...authHeader(cfg), depth: "0" },
  });
  if (resp.status === 404) {
    await ensureRemoteDir(cfg);
    return;
  }
  if (!resp.ok) throw new Error(`连接失败：HTTP ${resp.status}`);
}
