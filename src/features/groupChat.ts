/**
 * Group conversation orchestrator (v0.4).
 *
 * Flow when the user sends a message in a casual/work conversation:
 *   1. persist user message
 *   2. seed a queue:
 *        - if user message contains @mentions → those agents in order
 *        - else → conv.initial_responder (or first agent)
 *   3. for each agent in the queue:
 *        - stream a reply with group-aware system prompt
 *        - parse cleaned content + tags + new @mentions
 *        - if <silent/> alone → drop the assistant message (don't display, don't count)
 *        - if <done/> on work conv → close task and stop
 *        - if <waiting/> → stop the round
 *        - else enqueue new mentions (skipping ones already over per-agent cap)
 *   4. enforce max_total_turns and max_per_agent_turns; stop early if hit.
 */

import { useData } from "@/stores/data";
import {
  getConversation,
  listConversationAgents,
} from "@/repos/conversations";
import { getAgent } from "@/repos/agents";
import { getPersona } from "@/repos/personas";
import { getProvider } from "@/repos/providers";
import {
  insertMessage,
  updateMessageContent,
  deleteMessage,
  listMessages,
} from "@/repos/messages";
import { getCard } from "@/repos/cards";
import { listAgentSkills } from "@/repos/skills";
import { decryptSecret } from "@/lib/crypto";
import { streamChat, type ChatMessage } from "@/llm/openai";
import { buildSystemPrompt } from "@/llm/prompt";
import { parseAssistantMessage, type AgentRef } from "@/lib/mentions";
import { getDb } from "@/db";
import { pickActiveVariants } from "@/lib/variants";
import type { Agent } from "@/types/domain";

export interface GroupSendInput {
  conversationId: string;
  content: string;
  signal?: AbortSignal;
  activeVariants?: Record<string, string>;
}

const DEFAULT_MAX_TURNS = 8;
const DEFAULT_MAX_PER_AGENT = 3;

export async function sendUserMessageInGroup(input: GroupSendInput): Promise<void> {
  const { conversationId, content, signal, activeVariants } = input;
  const data = useData.getState();

  const conv = await getConversation(conversationId);
  if (!conv) throw new Error("Conversation not found");
  if (conv.kind === "private") {
    throw new Error("Use sendUserMessage for private conversations");
  }

  const persona = await getPersona(conv.user_persona_id);
  if (!persona) throw new Error("User persona missing");

  const convAgents = await listConversationAgents(conversationId);
  const agents: Agent[] = [];
  for (const ca of convAgents) {
    const a = await getAgent(ca.agent_id);
    if (a) agents.push(a);
  }
  if (agents.length < 2) throw new Error("Group needs at least 2 agents");

  const agentRefs: AgentRef[] = agents.map((a) => ({ id: a.id, name: a.name }));
  const agentById = new Map(agents.map((a) => [a.id, a]));

  // 1. persist user message
  const userMessageId = await insertMessage({
    conversation_id: conversationId,
    role: "user",
    sender_id: persona.id,
    content,
  });
  data.appendMessageLocal(conversationId, {
    id: userMessageId,
    conversation_id: conversationId,
    role: "user",
    sender_id: persona.id,
    parent_id: null,
    active_branch_id: null,
    variant_group_id: null,
    variant_index: 0,
    content,
    mentioned_agent_ids: "[]",
    turn_id: null,
    in_reply_to_message_id: null,
    tokens_in: null,
    tokens_out: null,
    cost_cents: null,
    created_at: new Date().toISOString(),
  });

  // 2. seed queue
  const userParsed = parseAssistantMessage(content, agentRefs, "");
  let queue: string[];
  if (userParsed.mentions.length > 0) {
    queue = [...userParsed.mentions];
  } else {
    const seed = conv.initial_responder ?? agents[0]!.id;
    queue = [seed];
  }

  const maxTotal = conv.max_total_turns ?? DEFAULT_MAX_TURNS;
  const maxPerAgent = conv.max_per_agent_turns ?? DEFAULT_MAX_PER_AGENT;
  const perAgentCount = new Map<string, number>();

  let totalTurns = 0;
  let stop = false;
  let prevMessageId = userMessageId;

  while (queue.length > 0 && totalTurns < maxTotal && !stop) {
    const agentId = queue.shift()!;
    const agent = agentById.get(agentId);
    if (!agent) continue;
    const used = perAgentCount.get(agentId) ?? 0;
    if (used >= maxPerAgent) continue;

    const result = await invokeAgent({
      conv,
      persona,
      agent,
      others: agents.filter((a) => a.id !== agent.id),
      convAgentBinding: convAgents.find((c) => c.agent_id === agent.id),
      prevMessageId,
      signal,
      activeVariants,
    });

    perAgentCount.set(agentId, used + 1);
    totalTurns++;

    if (result.dropped) continue; // silent-only: no message persisted
    prevMessageId = result.assistantMessageId;

    if (result.parsed.done && conv.kind === "work") {
      await getDb().then((db) =>
        db.execute(
          "UPDATE conversations SET task_status='done', updated_at=datetime('now') WHERE id=?",
          [conversationId],
        ),
      );
      stop = true;
      break;
    }
    if (result.parsed.waiting) {
      stop = true;
      break;
    }

    for (const mid of result.parsed.mentions) {
      if (mid === agentId) continue;
      if ((perAgentCount.get(mid) ?? 0) >= maxPerAgent) continue;
      queue.push(mid);
    }
  }
}

interface InvokeArgs {
  conv: NonNullable<Awaited<ReturnType<typeof getConversation>>>;
  persona: NonNullable<Awaited<ReturnType<typeof getPersona>>>;
  agent: Agent;
  others: Agent[];
  convAgentBinding: ReturnType<Array<any>["find"]> | undefined;
  prevMessageId: string;
  signal?: AbortSignal;
  activeVariants?: Record<string, string>;
}

interface InvokeResult {
  assistantMessageId: string;
  dropped: boolean;
  parsed: ReturnType<typeof parseAssistantMessage>;
}

async function invokeAgent(args: InvokeArgs): Promise<InvokeResult> {
  const { conv, persona, agent, others, convAgentBinding, prevMessageId, signal } = args;
  const data = useData.getState();

  const ca: any = convAgentBinding ?? {};
  const providerId = ca.provider_id ?? agent.default_provider_id;
  if (!providerId) throw new Error(`Agent ${agent.name} has no provider configured`);
  const provider = await getProvider(providerId);
  if (!provider) throw new Error(`Provider missing for ${agent.name}`);
  const model = ca.model ?? agent.default_model;
  if (!model) throw new Error(`Agent ${agent.name} has no model configured`);

  const card = agent.card_id ? await getCard(agent.card_id) : null;
  const skills = await listAgentSkills(agent.id);

  // Build wire history: tag each non-self assistant message with "@Name:" prefix
  // so the LLM can tell speakers apart in a single "assistant" stream.
  const history = await listMessages(conv.id);
  const activeHistory = pickActiveVariants(history, args.activeVariants ?? {});
  const sys: ChatMessage = {
    role: "system",
    content: buildSystemPrompt({
      agent,
      user: persona,
      card,
      skills,
      others: others.map((o) => ({ name: o.name, signature: o.signature })),
      conversation: conv,
    }),
  };
  const agentNameById = new Map(others.map((o) => [o.id, o.name]));
  agentNameById.set(agent.id, agent.name);

  const wire: ChatMessage[] = [sys];
  for (const m of activeHistory) {
    if (m.role === "system") continue;
    if (m.role === "user") {
      wire.push({ role: "user", content: `${persona.name}: ${m.content}` });
    } else {
      const speaker = agentNameById.get(m.sender_id ?? "") ?? "Someone";
      if (m.sender_id === agent.id) {
        wire.push({ role: "assistant", content: m.content });
      } else {
        // Treat other agents' turns as user-side context to keep this agent's
        // own assistant lane uncluttered.
        wire.push({ role: "user", content: `${speaker}: ${m.content}` });
      }
    }
  }

  // open placeholder
  const assistantMessageId = await insertMessage({
    conversation_id: conv.id,
    role: "assistant",
    sender_id: agent.id,
    content: "",
    parent_id: prevMessageId,
    in_reply_to_message_id: prevMessageId,
  });
  data.appendMessageLocal(conv.id, {
    id: assistantMessageId,
    conversation_id: conv.id,
    role: "assistant",
    sender_id: agent.id,
    parent_id: prevMessageId,
    active_branch_id: null,
    variant_group_id: null,
    variant_index: 0,
    content: "",
    mentioned_agent_ids: "[]",
    turn_id: null,
    in_reply_to_message_id: prevMessageId,
    tokens_in: null,
    tokens_out: null,
    cost_cents: null,
    created_at: new Date().toISOString(),
  });

  const apiKey = await decryptSecret(provider.api_key_encrypted);
  let acc = "";
  let usage: any = undefined;

  try {
    for await (const chunk of streamChat({
      base_url: provider.base_url,
      api_key: apiKey,
      model,
      messages: wire,
      temperature: ca.temperature ?? agent.default_temperature,
      top_p: ca.top_p ?? agent.default_top_p,
      max_tokens: ca.max_tokens ?? agent.default_max_tokens,
      signal,
    })) {
      if (chunk.usage) usage = chunk.usage;
      if (chunk.delta) {
        acc += chunk.delta;
        data.patchMessageLocal(conv.id, assistantMessageId, { content: acc });
      }
    }
  } catch (e: any) {
    acc = acc + (acc ? "\n\n" : "") + `*[error: ${e?.message ?? e}]*`;
    data.patchMessageLocal(conv.id, assistantMessageId, { content: acc });
  }

  const allAgentRefs: AgentRef[] = [agent, ...others].map((a) => ({
    id: a.id,
    name: a.name,
  }));
  const parsed = parseAssistantMessage(acc, allAgentRefs, agent.id);

  // Silent + no real content → drop the placeholder entirely.
  if (parsed.silent && parsed.cleanedContent.length === 0) {
    await deleteMessage(assistantMessageId);
    // also remove from local store
    const list = data.messagesByConv[conv.id] ?? [];
    useData.setState({
      messagesByConv: {
        ...data.messagesByConv,
        [conv.id]: list.filter((m) => m.id !== assistantMessageId),
      },
    });
    return { assistantMessageId, dropped: true, parsed };
  }

  // Persist final cleaned content + usage
  const finalContent = parsed.cleanedContent || acc;
  await updateMessageContent(assistantMessageId, finalContent, {
    tokens_in: usage?.prompt_tokens,
    tokens_out: usage?.completion_tokens,
  });
  data.patchMessageLocal(conv.id, assistantMessageId, { content: finalContent });

  return { assistantMessageId, dropped: false, parsed };
}
