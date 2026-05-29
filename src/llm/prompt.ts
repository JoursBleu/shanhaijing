/**
 * Build the system prompt for a single agent turn.
 *
 * v0.2: only handles persona_text + greeting context + user persona bio.
 * v0.3 will add card and skills.
 * v0.4 will add group context.
 * v0.6 will add memory retrieval.
 *
 * Keep this pure (no DB calls) — caller fetches inputs.
 */

import type { Agent, UserPersona } from "@/types/domain";

export interface BuildSystemPromptInput {
  agent: Agent;
  user: UserPersona;
}

export function buildSystemPrompt(input: BuildSystemPromptInput): string {
  const { agent, user } = input;
  const parts: string[] = [];

  if (agent.persona_text && agent.persona_text.trim()) {
    parts.push(agent.persona_text.trim());
  } else {
    parts.push(
      `You are ${agent.name}.${agent.signature ? " " + agent.signature : ""}`,
    );
  }

  parts.push(
    `\nYou are chatting with a human friend named "${user.name}".` +
      (user.bio
        ? ` Here is what they want you to know about them:\n${user.bio.trim()}`
        : ""),
  );

  parts.push(
    "\nReply naturally, in the user's language unless asked otherwise. " +
      "You may use Markdown, code blocks, and LaTeX (KaTeX `$...$` / `$$...$$`).",
  );

  return parts.join("\n").trim();
}
