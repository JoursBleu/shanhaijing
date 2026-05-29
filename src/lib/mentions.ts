/**
 * Parse @mentions and orchestration tags from an assistant message.
 *
 * Tags supported in v0.4:
 *   <silent/>   — "I have nothing useful to add this round."
 *   <done/>     — (work convs only) mark task as done.
 *   <waiting/>  — explicitly waiting for user input; stop the round.
 *
 * Mentions are matched against a list of known agent display names
 * (case-insensitive). Returns the resolved agent ids in the order they
 * first appear in the text.
 */

export interface AgentRef {
  id: string;
  name: string;
}

export interface ParsedAssistantMessage {
  cleanedContent: string;
  mentions: string[]; // agent ids
  silent: boolean;
  done: boolean;
  waiting: boolean;
}

export function parseAssistantMessage(
  raw: string,
  knownAgents: AgentRef[],
  selfId: string,
): ParsedAssistantMessage {
  const silent = /<\s*silent\s*\/?\s*>/i.test(raw);
  const done = /<\s*done\s*\/?\s*>/i.test(raw);
  const waiting = /<\s*waiting\s*\/?\s*>/i.test(raw);

  // Strip tags from displayed content but keep the body.
  const cleanedContent = raw
    .replace(/<\s*silent\s*\/?\s*>/gi, "")
    .replace(/<\s*done\s*\/?\s*>/gi, "")
    .replace(/<\s*waiting\s*\/?\s*>/gi, "")
    .trim();

  // Match @Name against known agent names. Allow CJK + letters + digits + - _
  const found = new Set<string>();
  const ids: string[] = [];

  // Sort longest name first to avoid prefix collisions.
  const sorted = [...knownAgents].sort((a, b) => b.name.length - a.name.length);
  for (const a of sorted) {
    if (a.id === selfId) continue;
    // Build a regex: @ + name (case-insensitive)
    const escaped = a.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`@${escaped}\\b`, "i");
    if (re.test(raw) && !found.has(a.id)) {
      found.add(a.id);
      ids.push(a.id);
    }
  }

  return { cleanedContent, mentions: ids, silent, done, waiting };
}
