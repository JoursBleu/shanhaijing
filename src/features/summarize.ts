/**
 * v0.6 — Conversation summarization + memory extraction.
 *
 * Given a finished (or paused) conversation, ask the model to produce:
 *   - 1 high-level summary
 *   - up to N atomic facts the agent should remember about the user
 *   - up to M user preferences
 * Each item is persisted to the `memories` table under the agent's id.
 *
 * This is intentionally a single non-streaming call to whichever provider the
 * primary agent is bound to. Group conversations: we summarize once per
 * participating agent so each agent's memory store reflects what it learned.
 */

import { getConversation, listConversationAgents } from "@/repos/conversations";
import { getAgent } from "@/repos/agents";
import { getPersona } from "@/repos/personas";
import { getProvider } from "@/repos/providers";
import { listMessages } from "@/repos/messages";
import { createMemory } from "@/repos/memories";
import { decryptSecret } from "@/lib/crypto";
import { streamChat, type ChatMessage } from "@/llm/openai";
import type { MemoryKind } from "@/types/domain";

const SUMMARY_INSTRUCTIONS = `You are an offline note-taker for the agent "{agent}". Read the conversation
below between {user} and {agent} (with possibly other agents). Produce a JSON
object with exactly these keys and nothing else:

{
  "summary": "one paragraph, <=400 chars, third-person, what happened",
  "facts":   ["short atomic facts about {user} or the world (<=15 items)"],
  "preferences": ["explicit preferences {user} stated (<=10 items)"]
}

Rules:
- Use {user}'s actual name and write each fact/preference as a self-contained sentence.
- No markdown, no commentary, ONLY the JSON object.
- If nothing notable was said, return empty arrays and a one-line summary.`;

interface ParsedSummary {
  summary: string;
  facts: string[];
  preferences: string[];
}

function tryParseJson(raw: string): ParsedSummary | null {
  // Tolerate leading/trailing prose by extracting the first balanced {...}.
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const slice = raw.slice(start, end + 1);
  try {
    const obj = JSON.parse(slice);
    return {
      summary: typeof obj.summary === "string" ? obj.summary : "",
      facts: Array.isArray(obj.facts)
        ? obj.facts.filter((x: unknown): x is string => typeof x === "string")
        : [],
      preferences: Array.isArray(obj.preferences)
        ? obj.preferences.filter(
            (x: unknown): x is string => typeof x === "string",
          )
        : [],
    };
  } catch {
    return null;
  }
}

export interface SummarizeResult {
  agentId: string;
  summaryMemoryId: string | null;
  factMemoryIds: string[];
  preferenceMemoryIds: string[];
  raw: string;
}

export async function summarizeConversation(
  conversationId: string,
): Promise<SummarizeResult[]> {
  const conv = await getConversation(conversationId);
  if (!conv) throw new Error("Conversation not found");
  const persona = await getPersona(conv.user_persona_id);
  if (!persona) throw new Error("User persona missing");
  const convAgents = await listConversationAgents(conversationId);
  const history = await listMessages(conversationId);
  if (history.length === 0) return [];

  // Build a plain transcript once.
  const speakerName = new Map<string | null, string>();
  speakerName.set(persona.id, persona.name);
  for (const ca of convAgents) {
    const a = await getAgent(ca.agent_id);
    if (a) speakerName.set(a.id, a.name);
  }
  const transcript = history
    .filter((m) => m.role !== "system")
    .map((m) => {
      const who = speakerName.get(m.sender_id) ??
        (m.role === "user" ? persona.name : "Agent");
      return `${who}: ${m.content}`;
    })
    .join("\n\n");

  const results: SummarizeResult[] = [];

  for (const ca of convAgents) {
    const agent = await getAgent(ca.agent_id);
    if (!agent) continue;
    const providerId = ca.provider_id ?? agent.default_provider_id;
    if (!providerId) continue;
    const provider = await getProvider(providerId);
    if (!provider) continue;
    const model = ca.model ?? agent.default_model;
    if (!model) continue;

    const sys: ChatMessage = {
      role: "system",
      content: SUMMARY_INSTRUCTIONS.split("{agent}")
        .join(agent.name)
        .split("{user}")
        .join(persona.name),
    };
    const user: ChatMessage = {
      role: "user",
      content: `Conversation transcript:\n\n${transcript}`,
    };
    const apiKey = await decryptSecret(provider.api_key_encrypted);
    let raw = "";
    try {
      for await (const chunk of streamChat({
        base_url: provider.base_url,
        api_key: apiKey,
        model,
        messages: [sys, user],
        temperature: 0.2,
        max_tokens: 1500,
      })) {
        if (chunk.delta) raw += chunk.delta;
      }
    } catch (e) {
      results.push({
        agentId: agent.id,
        summaryMemoryId: null,
        factMemoryIds: [],
        preferenceMemoryIds: [],
        raw: `*[error: ${(e as any)?.message ?? e}]*`,
      });
      continue;
    }

    const parsed = tryParseJson(raw);
    let summaryId: string | null = null;
    const factIds: string[] = [];
    const prefIds: string[] = [];
    if (parsed) {
      if (parsed.summary.trim()) {
        summaryId = await createMemory({
          agent_id: agent.id,
          conversation_id: conversationId,
          kind: "summary",
          content: parsed.summary.trim(),
          importance: 0.7,
        });
      }
      for (const f of parsed.facts) {
        const t = f.trim();
        if (!t) continue;
        factIds.push(
          await createMemory({
            agent_id: agent.id,
            conversation_id: conversationId,
            kind: "fact" as MemoryKind,
            content: t,
            importance: 0.6,
          }),
        );
      }
      for (const p of parsed.preferences) {
        const t = p.trim();
        if (!t) continue;
        prefIds.push(
          await createMemory({
            agent_id: agent.id,
            conversation_id: conversationId,
            kind: "preference" as MemoryKind,
            content: t,
            importance: 0.8,
          }),
        );
      }
    }

    results.push({
      agentId: agent.id,
      summaryMemoryId: summaryId,
      factMemoryIds: factIds,
      preferenceMemoryIds: prefIds,
      raw,
    });
  }

  return results;
}
