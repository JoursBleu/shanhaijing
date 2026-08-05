/**
 * Rebuild the system prompt the next agent turn would see, for inspection.
 * Mirrors what chat.ts assembles — keep the two in step.
 */

import { getConversation } from "@/repos/conversations";
import { getAgent } from "@/repos/agents";
import { listAgentSkills } from "@/repos/skills";
import { listMessages } from "@/repos/messages";
import { retrieveMemories } from "@/features/memoryRetrieval";
import { resolveAgentTools } from "@/features/agentTools";
import { buildSystemPrompt } from "@/llm/prompt";

export async function buildPromptDebug(conversationId: string): Promise<string> {
  const conv = await getConversation(conversationId);
  if (!conv) throw new Error("Conversation not found");
  if (!conv.agent_id) return "(this conversation has no agent)";

  const agent = await getAgent(conv.agent_id);
  if (!agent) return "(the agent was deleted)";

  const skills = await listAgentSkills(agent.id);
  const history = await listMessages(conversationId);
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const memories = await retrieveMemories(agent.id, lastUser?.content ?? "", 5);
  const caps = await resolveAgentTools(agent);

  return buildSystemPrompt({
    agent,
    skills,
    memories,
    toolNames: caps.tools.map((t) => t.name),
  });
}
