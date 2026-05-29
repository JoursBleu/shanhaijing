/**
 * v0.7 — Build the same system prompt that the NEXT agent turn would see,
 * for debugging. Picks the first conv agent in group conversations.
 */

import { getConversation, listConversationAgents } from "@/repos/conversations";
import { getAgent } from "@/repos/agents";
import { getPersona } from "@/repos/personas";
import { getCard } from "@/repos/cards";
import { listAgentSkills } from "@/repos/skills";
import { listMessages } from "@/repos/messages";
import { retrieveMemoriesForAgent } from "@/repos/memories";
import { buildSystemPrompt } from "@/llm/prompt";

export async function buildPromptDebug(conversationId: string): Promise<string> {
  const conv = await getConversation(conversationId);
  if (!conv) throw new Error("Conversation not found");
  const persona = await getPersona(conv.user_persona_id);
  if (!persona) throw new Error("User persona missing");
  const convAgents = await listConversationAgents(conversationId);
  if (convAgents.length === 0) return "(no agents in this conversation)";

  const primaryAgent = await getAgent(convAgents[0]!.agent_id);
  if (!primaryAgent) throw new Error("Primary agent missing");

  const others = [];
  for (let i = 1; i < convAgents.length; i++) {
    const a = await getAgent(convAgents[i]!.agent_id);
    if (a) others.push({ name: a.name, signature: a.signature });
  }

  const card = primaryAgent.card_id ? await getCard(primaryAgent.card_id) : null;
  const skills = await listAgentSkills(primaryAgent.id);
  const history = await listMessages(conversationId);
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const memories = await retrieveMemoriesForAgent(
    primaryAgent.id,
    lastUser?.content ?? conv.task_goal ?? "",
    5,
  );

  return buildSystemPrompt({
    agent: primaryAgent,
    user: persona,
    card,
    skills,
    others: others.length > 0 ? others : undefined,
    conversation: conv,
    memories,
  });
}
