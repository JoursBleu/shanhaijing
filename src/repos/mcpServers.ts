import { getDb } from "@/db";
import { newId } from "@/lib/id";

export interface McpServer {
  id: string;
  name: string;
  transport: "http" | "sse";
  url: string;
  /** JSON object of extra request headers (e.g. auth). */
  headers_json: string;
  enabled: boolean;
  created_at: string;
}

interface Row {
  id: string;
  name: string;
  transport: string;
  url: string;
  headers_json: string;
  enabled: number;
  created_at: string;
}

export async function listMcpServers(): Promise<McpServer[]> {
  const db = await getDb();
  const rows = await db.select<Row[]>(
    "SELECT * FROM mcp_servers ORDER BY created_at",
  );
  return rows.map((r) => ({
    ...r,
    transport: r.transport === "sse" ? "sse" : "http",
    enabled: !!r.enabled,
  }));
}

export async function createMcpServer(input: {
  name: string;
  url: string;
  transport?: "http" | "sse";
  headers?: Record<string, string>;
}): Promise<string> {
  const id = newId();
  const db = await getDb();
  await db.execute(
    `INSERT INTO mcp_servers (id, name, transport, url, headers_json, enabled)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [
      id,
      input.name,
      input.transport ?? "http",
      input.url,
      JSON.stringify(input.headers ?? {}),
    ],
  );
  return id;
}

export async function setMcpServerEnabled(
  id: string,
  enabled: boolean,
): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE mcp_servers SET enabled = ? WHERE id = ?", [
    enabled ? 1 : 0,
    id,
  ]);
}

export async function deleteMcpServer(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM mcp_servers WHERE id = ?", [id]);
}
