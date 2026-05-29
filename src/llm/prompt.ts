/**
 * Build the system prompt for a single agent turn.
 *
 * v0.3: persona_text + (optional) character card + (optional) skills + user persona bio.
 */

import type { Agent, CharacterCard, Conversation, Skill, UserPersona } from "@/types/domain";
import type { CharacterCardV2 } from "@/lib/png";

export interface BuildSystemPromptInput {
  agent: Agent;
  user: UserPersona;
  card?: CharacterCard | null;
  skills?: Skill[];
  /** Other agents present in the conversation (excluding self). Triggers group section. */
  others?: { name: string; signature?: string }[];
  /** If provided, the conversation context (used for work/group meta). */
  conversation?: Pick<Conversation, "kind" | "task_goal" | "task_status"> | null;
}

function substitute(text: string, agent: Agent, user: UserPersona): string {
  return text
    .replace(/\{\{char\}\}/gi, agent.name)
    .replace(/\{\{user\}\}/gi, user.name);
}

export function buildSystemPrompt(input: BuildSystemPromptInput): string {
  const { agent, user, card, skills } = input;
  const parts: string[] = [];

  // ---- Character / persona ----
  let parsedCard: CharacterCardV2 | null = null;
  if (card) {
    try {
      parsedCard = JSON.parse(card.parsed_json) as CharacterCardV2;
    } catch {
      parsedCard = null;
    }
  }

  if (parsedCard?.data) {
    const d = parsedCard.data;
    if (d.system_prompt) parts.push(substitute(d.system_prompt, agent, user));
    parts.push(`You are ${agent.name}.${agent.signature ? " " + agent.signature : ""}`);
    if (d.description) parts.push("## Character\n" + substitute(d.description, agent, user));
    if (d.personality) parts.push("## Personality\n" + substitute(d.personality, agent, user));
    if (d.scenario) parts.push("## Scenario\n" + substitute(d.scenario, agent, user));
    if (d.mes_example) parts.push("## Example dialogue\n" + substitute(d.mes_example, agent, user));
    if (d.post_history_instructions) {
      parts.push(substitute(d.post_history_instructions, agent, user));
    }
  } else if (agent.persona_text && agent.persona_text.trim()) {
    parts.push(substitute(agent.persona_text.trim(), agent, user));
  } else {
    parts.push(
      `You are ${agent.name}.${agent.signature ? " " + agent.signature : ""}`,
    );
  }

  // ---- Skills ----
  if (skills && skills.length > 0) {
    parts.push(
      "## Skills\nThe following skills are available to you. Read each carefully and apply when the situation matches.",
    );
    for (const s of skills) {
      parts.push(`### Skill: ${s.name}\n${s.body_markdown.trim()}`);
    }
  }

  // ---- Group context (if any) ----
  const others = input.others ?? [];
  const conv = input.conversation;
  if (others.length > 0 || (conv && conv.kind !== "private")) {
    const lines: string[] = ["## Group conversation"];
    if (conv?.kind === "work") {
      lines.push(
        `This is a **work** conversation. Goal: ${conv.task_goal || "(unspecified)"}.`,
      );
      lines.push(
        "When the task is complete, emit a single `<done/>` tag.",
      );
    } else if (conv?.kind === "casual") {
      lines.push("This is a **casual** group chat. Stay social and brief.");
    }
    if (others.length > 0) {
      lines.push("Other agents present:");
      for (const o of others) {
        lines.push(`- ${o.name}${o.signature ? ` — ${o.signature}` : ""}`);
      }
    }
    lines.push(
      "**The human user `" + user.name + "` is ALWAYS present and may interject at any time.**",
    );
    lines.push(
      "Routing rules:\n" +
        "- To hand off to another agent, mention them with `@name` somewhere in your reply.\n" +
        "- If you have nothing useful to add this round, emit `<silent/>` and nothing else.\n" +
        "- If you think the user should reply next, emit `<waiting/>`.\n" +
        "- Do NOT spam mentions. One or zero is normal.",
    );
    parts.push(lines.join("\n"));
  }

  // ---- User context ----
  parts.push(
    `## Your conversation partner\nYou are chatting with a human friend named "${user.name}".` +
      (user.bio
        ? ` Here is what they want you to know about them:\n${user.bio.trim()}`
        : ""),
  );

  parts.push(
    "## Output style\nReply naturally in the user's language unless asked otherwise. " +
      "You may use Markdown, code blocks, and LaTeX (KaTeX `$...$` for inline, `$$...$$` for block).",
  );

  return parts
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .join("\n\n")
    .trim();
}
