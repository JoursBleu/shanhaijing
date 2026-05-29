import { getDb } from "@/db";
import { newId } from "@/lib/id";
import type { Provider } from "@/types/domain";

export interface ProviderInput {
  name: string;
  base_url: string;
  api_key_encrypted: string | null;
  kind: Provider["kind"];
  enabled?: boolean;
}

export async function listProviders(): Promise<Provider[]> {
  const db = await getDb();
  const rows = await db.select<any[]>(
    "SELECT * FROM providers ORDER BY created_at",
  );
  return rows.map((r) => ({ ...r, enabled: !!r.enabled })) as Provider[];
}

export async function getProvider(id: string): Promise<Provider | null> {
  const db = await getDb();
  const rows = await db.select<any[]>(
    "SELECT * FROM providers WHERE id = ?",
    [id],
  );
  const r = rows[0];
  return r ? ({ ...r, enabled: !!r.enabled } as Provider) : null;
}

export async function createProvider(input: ProviderInput): Promise<string> {
  const id = newId();
  const db = await getDb();
  await db.execute(
    `INSERT INTO providers (id, name, base_url, api_key_encrypted, kind, enabled)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.base_url,
      input.api_key_encrypted,
      input.kind,
      input.enabled === false ? 0 : 1,
    ],
  );
  return id;
}

export async function updateProvider(
  id: string,
  patch: Partial<ProviderInput>,
): Promise<void> {
  const db = await getDb();
  const fields: string[] = [];
  const values: any[] = [];
  for (const [k, v] of Object.entries(patch)) {
    fields.push(`${k} = ?`);
    values.push(k === "enabled" ? (v ? 1 : 0) : v);
  }
  if (!fields.length) return;
  values.push(id);
  await db.execute(
    `UPDATE providers SET ${fields.join(", ")} WHERE id = ?`,
    values,
  );
}

export async function deleteProvider(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM providers WHERE id = ?", [id]);
}

/**
 * Cache fetched models for a provider. Replaces existing rows.
 */
export async function replaceModels(
  providerId: string,
  models: { name: string; context_length?: number | null }[],
): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM models WHERE provider_id = ?", [providerId]);
  for (const m of models) {
    await db.execute(
      `INSERT INTO models (id, provider_id, name, context_length)
       VALUES (?, ?, ?, ?)`,
      [newId(), providerId, m.name, m.context_length ?? null],
    );
  }
}

export async function listModels(providerId: string) {
  const db = await getDb();
  return db.select<any[]>(
    "SELECT * FROM models WHERE provider_id = ? ORDER BY name",
    [providerId],
  );
}
