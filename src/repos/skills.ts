import { getDb } from "@/db";
import { newId } from "@/lib/id";
import type { Skill } from "@/types/domain";

export interface SkillInput {
  name: string;
  description?: string;
  body_markdown: string;
  metadata_json?: string;
}

export async function listSkills(): Promise<Skill[]> {
  const db = await getDb();
  return await db.select<Skill[]>(
    "SELECT * FROM skills ORDER BY updated_at DESC",
  );
}

export async function getSkill(id: string): Promise<Skill | null> {
  const db = await getDb();
  const rows = await db.select<Skill[]>(
    "SELECT * FROM skills WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

export async function createSkill(input: SkillInput): Promise<string> {
  const id = newId();
  const db = await getDb();
  await db.execute(
    `INSERT INTO skills (id, name, description, body_markdown, metadata_json)
     VALUES (?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.description ?? "",
      input.body_markdown,
      input.metadata_json ?? "{}",
    ],
  );
  return id;
}

export async function updateSkill(
  id: string,
  patch: Partial<SkillInput>,
): Promise<void> {
  const db = await getDb();
  const fields: string[] = [];
  const vals: any[] = [];
  for (const [k, v] of Object.entries(patch)) {
    fields.push(`${k} = ?`);
    vals.push(v);
  }
  if (fields.length === 0) return;
  fields.push("updated_at = datetime('now')");
  vals.push(id);
  await db.execute(`UPDATE skills SET ${fields.join(", ")} WHERE id = ?`, vals);
}

export async function deleteSkill(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM skills WHERE id = ?", [id]);
}

export async function listAgentSkills(agentId: string): Promise<Skill[]> {
  const db = await getDb();
  return await db.select<Skill[]>(
    `SELECT s.* FROM skills s
     JOIN agent_skills a ON a.skill_id = s.id
     WHERE a.agent_id = ?
     ORDER BY a.position, s.name`,
    [agentId],
  );
}

export async function setAgentSkills(
  agentId: string,
  skillIds: string[],
): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM agent_skills WHERE agent_id = ?", [agentId]);
  for (let i = 0; i < skillIds.length; i++) {
    await db.execute(
      "INSERT INTO agent_skills (agent_id, skill_id, position) VALUES (?, ?, ?)",
      [agentId, skillIds[i], i],
    );
  }
}
