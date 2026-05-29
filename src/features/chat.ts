/**
 * Send a user message in a private (1v1) conversation, then stream the
 * assistant reply. Persists everything via the repos and pushes incremental
 * updates into the data store so the UI re-renders as tokens arrive.
 */

import { useData } from "@/stores/data";
import { getConversation, listConversationAgents } from "@/repos/conversations";
import { getAgent } from "@/repos/agents";
import { getPersona } from "@/repos/personas";
import { getProvider } from "@/repos/providers";
import {
  insertMessage,
  updateMessageContent,
  listMessages,
} from "@/repos/messages";
import { decryptSecret } from "@/lib/crypto";
import { streamChat, type ChatMessage } from "@/llm/openai";
import { buildSystemPrompt } from "@/llm/prompt";
import { getCard } from "@/repos/cards";
import { listAgentSkills } from "@/repos/skills";
import { retrieveMemoriesForAgent } from "@/repos/memories";
import { pickActiveVariants } from "@/lib/variants";

export interface SendUserMessageInput {
  conversationId: string;
  content: string;
  signal?: AbortSignal;
  activeVariants?: Record<string, string>;
}

export interface SendResult {
  userMessageId: string;
  assistantMessageId: string;
}

export async function sendUserMessage(
  input: SendUserMessageInput,
): Promise<SendResult> {
  const { conversationId, content, signal } = input;
  const data = useData.getState();

  const conv = await getConversation(conversationId);
  if (!conv) throw new Error("Conversation not found");
  const persona = await getPersona(conv.user_persona_id);
  if (!persona) throw new Error("User persona missing");

  if (conv.kind !== "private") {
    throw new Error("sendUserMessage is for private convs; use sendUserMessageInGroup");
  }
  const convAgents = await listConversationAgents(conversationId);
  if (convAgents.length !== 1) {
    throw new Error("Private conversation must have exactly one agent");
  }
  const ca = convAgents[0]!;
  const agent = await getAgent(ca.agent_id);
  if (!agent) throw new Error("Agent missing");

  const providerId = ca.provider_id ?? agent.default_provider_id;
  if (!providerId) throw new Error("Agent has no provider configured");
  const provider = await getProvider(providerId);
  if (!provider) throw new Error("Provider missing");

  const model = ca.model ?? agent.default_model;
  if (!model) throw new Error("Agent has no model configured");

  const temperature = ca.temperature ?? agent.default_temperature;
  const top_p = ca.top_p ?? agent.default_top_p;
  const max_tokens = ca.max_tokens ?? agent.default_max_tokens;

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

  // 2. build history + system prompt
  const history = await listMessages(conversationId);
  const card = agent.card_id ? await getCard(agent.card_id) : null;
  const skills = await listAgentSkills(agent.id);
  const memories = await retrieveMemoriesForAgent(agent.id, content, 5);
  const sys: ChatMessage = {
    role: "system",
    content: buildSystemPrompt({ agent, user: persona, card, skills, conversation: conv, memories }),
  };
  const wire: ChatMessage[] = [sys];
  const active = pickActiveVariants(history, input.activeVariants ?? {});
  for (const m of active) {
    if (m.role === "system") continue;
    wire.push({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    });
  }

  // 3. open assistant placeholder
  const assistantMessageId = await insertMessage({
    conversation_id: conversationId,
    role: "assistant",
    sender_id: agent.id,
    content: "",
    parent_id: userMessageId,
    in_reply_to_message_id: userMessageId,
  });
  data.appendMessageLocal(conversationId, {
    id: assistantMessageId,
    conversation_id: conversationId,
    role: "assistant",
    sender_id: agent.id,
    parent_id: userMessageId,
    active_branch_id: null,
    variant_group_id: null,
    variant_index: 0,
    content: "",
    mentioned_agent_ids: "[]",
    turn_id: null,
    in_reply_to_message_id: userMessageId,
    tokens_in: null,
    tokens_out: null,
    cost_cents: null,
    created_at: new Date().toISOString(),
  });

  // 4. stream
  const apiKey = await decryptSecret(provider.api_key_encrypted);
  let acc = "";
  let usage: any = undefined;
  try {
    for await (const chunk of streamChat({
      base_url: provider.base_url,
      api_key: apiKey,
      model,
      messages: wire,
      temperature,
      top_p,
      max_tokens,
      signal,
    })) {
      if (chunk.usage) usage = chunk.usage;
      if (chunk.delta) {
        acc += chunk.delta;
        data.patchMessageLocal(conversationId, assistantMessageId, {
          content: acc,
        });
      }
    }
  } catch (e: any) {
    acc = acc + (acc ? "\n\n" : "") + `*[error: ${e?.message ?? e}]*`;
    data.patchMessageLocal(conversationId, assistantMessageId, { content: acc });
  }

  // 5. persist final content + usage
  await updateMessageContent(assistantMessageId, acc, {
    tokens_in: usage?.prompt_tokens,
    tokens_out: usage?.completion_tokens,
  });
  return { userMessageId, assistantMessageId };
}

export interface RegenerateInput {
  conversationId: string;
  assistantMessageId: string;
  signal?: AbortSignal;
  activeVariants?: Record<string, string>;
}

/**
 * Create a new assistant variant for the given assistant message, in the same
 * variant group. History is the conversation up to (but not including) the
 * variant being regenerated; only the "latest" variant per group is used when
 * building wire history (matches the default UI behavior).
 */
export async function regenerateAssistantMessage(
  input: RegenerateInput,
): Promise<string> {
  const { conversationId, assistantMessageId, signal } = input;
  const data = useData.getState();

  const conv = await getConversation(conversationId);
  if (!conv) throw new Error("Conversation not found");
  const persona = await getPersona(conv.user_persona_id);
  if (!persona) throw new Error("User persona missing");
  if (conv.kind !== "private") {
    throw new Error("Group regenerate is not implemented in v0.5");
  }
  const convAgents = await listConversationAgents(conversationId);
  const ca = convAgents[0]!;
  const agent = await getAgent(ca.agent_id);
  if (!agent) throw new Error("Agent missing");
  const provider = await getProvider(ca.provider_id ?? agent.default_provider_id!);
  if (!provider) throw new Error("Provider missing");
  const model = ca.model ?? agent.default_model;
  if (!model) throw new Error("Agent has no model configured");

  const all = await listMessages(conversationId);
  const target = all.find((m) => m.id === assistantMessageId);
  if (!target) throw new Error("Assistant message not found");
  const groupId = target.variant_group_id ?? target.id;
  const sameGroup = all.filter((m) => (m.variant_group_id ?? m.id) === groupId);
  const nextIndex =
    Math.max(0, ...sameGroup.map((m) => m.variant_index)) + 1;

  // Build wire history from latest variant of each prior group, stopping
  // just before the target group's parent reply.
  const card = agent.card_id ? await getCard(agent.card_id) : null;
  const skills = await listAgentSkills(agent.id);
  // Use the last user message as the retrieval query (or the target's parent if
  // no user msg exists).
  const lastUser = [...all].reverse().find((m) => m.role === "user");
  const memories = await retrieveMemoriesForAgent(
    agent.id,
    lastUser?.content ?? target.content ?? "",
    5,
  );
  const sys: ChatMessage = {
    role: "system",
    content: buildSystemPrompt({ agent, user: persona, card, skills, conversation: conv, memories }),
  };

  // Group prior messages: for each variant group keep active or latest by
  // variant_index. Skip the target group itself.
  const prior = all.filter(
    (m) => (m.variant_group_id ?? m.id) !== groupId,
  );
  const selected = pickActiveVariants(prior, input.activeVariants ?? {});
  selected.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const wire: ChatMessage[] = [sys];
  for (const m of selected) {
    if (m.role === "system") continue;
    wire.push({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    });
  }

  // New variant placeholder
  const newId_ = await insertMessage({
    conversation_id: conversationId,
    role: "assistant",
    sender_id: agent.id,
    content: "",
    parent_id: target.parent_id,
    in_reply_to_message_id: target.in_reply_to_message_id,
    variant_group_id: groupId,
    variant_index: nextIndex,
  });
  data.appendMessageLocal(conversationId, {
    id: newId_,
    conversation_id: conversationId,
    role: "assistant",
    sender_id: agent.id,
    parent_id: target.parent_id,
    active_branch_id: null,
    variant_group_id: groupId,
    variant_index: nextIndex,
    content: "",
    mentioned_agent_ids: "[]",
    turn_id: null,
    in_reply_to_message_id: target.in_reply_to_message_id,
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
        data.patchMessageLocal(conversationId, newId_, { content: acc });
      }
    }
  } catch (e: any) {
    acc = acc + (acc ? "\n\n" : "") + `*[error: ${e?.message ?? e}]*`;
    data.patchMessageLocal(conversationId, newId_, { content: acc });
  }
  await updateMessageContent(newId_, acc, {
    tokens_in: usage?.prompt_tokens,
    tokens_out: usage?.completion_tokens,
  });
  return newId_;
}
