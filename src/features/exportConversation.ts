/**
 * v0.7 — Export a conversation as Markdown or JSON, downloaded via a
 * browser-side Blob. Pure client; no Tauri command needed.
 */

import { getConversation } from "@/repos/conversations";
import { getAgent } from "@/repos/agents";
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
  const agent = conv.agent_id ? await getAgent(conv.agent_id) : null;
  const all = await listMessages(conversationId);
  const visible = pickActiveVariants(all, opts.activeVariants ?? {});

  const lines: string[] = [];
  lines.push(`# ${conv.title || "(未命名)"}`);
  lines.push("");
  lines.push(
    `> agent: ${agent?.name ?? "?"} · ${new Date(conv.created_at + "Z").toLocaleString()}`,
  );
  lines.push("");

  for (const m of visible) {
    if (m.role === "system") continue;
    const who = m.role === "user" ? "user" : agent?.name ?? "agent";
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
  const agent = conv.agent_id ? await getAgent(conv.agent_id) : null;
  const messages = await listMessages(conversationId);
  const payload = {
    schema: "shanhaijing.conversation.v2",
    exported_at: new Date().toISOString(),
    conversation: conv,
    agent,
    messages,
  };
  download(
    `${safeFilename(conv.title || "conversation")}.json`,
    "application/json;charset=utf-8",
    JSON.stringify(payload, null, 2),
  );
}
