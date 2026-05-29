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

export interface SendUserMessageInput {
  conversationId: string;
  content: string;
  signal?: AbortSignal;
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

  const convAgents = await listConversationAgents(conversationId);
  if (conv.kind === "private" && convAgents.length !== 1) {
    throw new Error("Private conversation must have exactly one agent");
  }
  // v0.2: only private flow implemented.
  if (conv.kind !== "private") {
    throw new Error("Group flow lands in v0.4");
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
  const sys: ChatMessage = {
    role: "system",
    content: buildSystemPrompt({ agent, user: persona }),
  };
  const wire: ChatMessage[] = [sys];
  for (const m of history) {
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
