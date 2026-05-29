/**
 * v0.7 — Export a conversation as Markdown or JSON, downloaded via a
 * browser-side Blob. Pure client; no Tauri command needed.
 */

import { getConversation, listConversationAgents } from "@/repos/conversations";
import { getAgent } from "@/repos/agents";
import { getPersona } from "@/repos/personas";
import { listMessages } from "@/repos/messages";
import { pickActiveVariants } from "@/lib/variants";

function download(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

function safeFilename(s: string): string {
  return s.replace(/[\\\/:*?"<>|]+/g, "_").slice(0, 80) || "conversation";
}

export async function exportConversationAsMarkdown(
  conversationId: string,
  opts: { activeVariants?: Record<string, string> } = {},
): Promise<void> {
  const conv = await getConversation(conversationId);
  if (!conv) throw new Error("Conversation not found");
  const persona = await getPersona(conv.user_persona_id);
  const convAgents = await listConversationAgents(conversationId);
  const agentById = new Map<string, string>();
  for (const ca of convAgents) {
    const a = await getAgent(ca.agent_id);
    if (a) agentById.set(a.id, a.name);
  }
  const all = await listMessages(conversationId);
  const visible = pickActiveVariants(all, opts.activeVariants ?? {});

  const lines: string[] = [];
  lines.push(`# ${conv.title || "(未命名)"}`);
  lines.push("");
  lines.push(
    `> kind: ${conv.kind} · persona: ${persona?.name ?? "?"} · ${new Date(conv.created_at + "Z").toLocaleString()}`,
  );
  if (conv.kind === "work" && conv.task_goal) {
    lines.push(`> goal: ${conv.task_goal}`);
  }
  lines.push("");

  for (const m of visible) {
    if (m.role === "system") continue;
    const who =
      m.role === "user"
        ? persona?.name ?? "user"
        : agentById.get(m.sender_id ?? "") ?? "agent";
    lines.push(`### ${who} · ${m.role}`);
    lines.push("");
    lines.push(m.content);
    lines.push("");
  }

  download(
    `${safeFilename(conv.title || "conversation")}.md`,
    "text/markdown;charset=utf-8",
    lines.join("\n"),
  );
}

export async function exportConversationAsJson(
  conversationId: string,
): Promise<void> {
  const conv = await getConversation(conversationId);
  if (!conv) throw new Error("Conversation not found");
  const persona = await getPersona(conv.user_persona_id);
  const convAgents = await listConversationAgents(conversationId);
  const agents = [];
  for (const ca of convAgents) {
    const a = await getAgent(ca.agent_id);
    if (a) agents.push(a);
  }
  const messages = await listMessages(conversationId);
  const payload = {
    schema: "shanhaijing.conversation.v1",
    exported_at: new Date().toISOString(),
    conversation: conv,
    persona,
    agents,
    messages,
  };
  download(
    `${safeFilename(conv.title || "conversation")}.json`,
    "application/json;charset=utf-8",
    JSON.stringify(payload, null, 2),
  );
}
