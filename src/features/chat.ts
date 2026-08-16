/**
 * Send a user message and stream the agent's reply.
 *
 * A conversation has exactly one agent. Its provider/model/sampling settings
 * default to the agent's and can be overridden per conversation.
 *
 * Both sending and regenerating run through the agent loop, so a regenerated
 * answer has the same tool access as the original — previously regenerate fell
 * back to a plain stream and silently lost tools.
 */

import { getConversation } from "@/repos/conversations";
import { getAgent } from "@/repos/agents";
import { getProvider } from "@/repos/providers";
import {
  insertMessage,
  updateMessageContent,
  listMessages,
  listToolMessages,
  localMessage,
} from "@/repos/messages";
import { decryptSecret } from "@/lib/crypto";
import type { ChatMessage } from "@/llm/openai";
import { buildSystemPrompt } from "@/llm/prompt";
import { listAgentSkills } from "@/repos/skills";
import { retrieveMemories } from "@/features/memoryRetrieval";
import { pickActiveVariants } from "@/lib/variants";
import { resolveAgentTools } from "@/features/agentTools";
import { buildWireHistory, persistToolMessages } from "@/features/wireHistory";
import { getRuntimeClient } from "@/runtime";
import { getRuntimeSession, upsertRuntimeSession } from "@/repos/runtimeSessions";
import type { Agent, Conversation, Message, Provider } from "@/types/domain";
import { invoke } from "@tauri-apps/api/core";
import { newId } from "@/lib/id";

/**
 * Everything the turn needs from the outside world. The agent loop must not
 * reach into the UI: whoever calls it decides how a new message is shown and
 * how the user is asked to approve a tool. That is what lets this same code
 * run headless later.
 */
export interface TurnHost {
  onMessageCreated?: (m: Message) => void;
  onMessageUpdated?: (id: string, content: string) => void;
  /** Resolve true to run a tool that is not auto-approved. Missing approval denies. */
  approve?: (call: { name: string; args: unknown; agentName: string }) => Promise<boolean>;
}

interface TurnContext {
  conv: Conversation;
  agent: Agent;
  provider: Provider;
  apiKey: string;
  model: string;
  temperature: number;
  top_p: number;
  max_tokens: number | null;
}

async function resolveTurn(conversationId: string): Promise<TurnContext> {
  const conv = await getConversation(conversationId);
  if (!conv) throw new Error("Conversation not found");
  if (!conv.agent_id) throw new Error("This conversation has no agent");

  const agent = await getAgent(conv.agent_id);
  if (!agent) throw new Error("Agent missing");

  const providerId = conv.provider_id ?? agent.default_provider_id;
  if (!providerId) throw new Error("Agent has no provider configured");
  const provider = await getProvider(providerId);
  if (!provider) throw new Error("Provider missing");

  const model = conv.model ?? agent.default_model;
  if (!model) throw new Error("Agent has no model configured");

  return {
    conv,
    agent,
    provider,
    apiKey: await decryptSecret(provider.api_key_encrypted),
    model,
    temperature: conv.temperature ?? agent.default_temperature,
    top_p: conv.top_p ?? agent.default_top_p,
    max_tokens: conv.max_tokens ?? agent.default_max_tokens,
  };
}

export interface SendUserMessageInput extends TurnHost {
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
  const ctx = await resolveTurn(conversationId);
  const { agent } = ctx;

  const userMessageId = await insertMessage({
    conversation_id: conversationId,
    role: "user",
    sender_id: null,
    content,
  });
  input.onMessageCreated?.(
    localMessage({
      id: userMessageId,
      conversation_id: conversationId,
      role: "user",
      sender_id: null,
      content,
    }),
  );

  const history = await listMessages(conversationId);
  const skills = await listAgentSkills(agent.id);
  const memories = await retrieveMemories(agent.id, content, 5);
  const caps = await resolveAgentTools(agent);
  const sys: ChatMessage = {
    role: "system",
    content: buildSystemPrompt({
      agent,
      skills,
      memories,
      toolNames: caps.tools.map((t) => t.name),
    }),
  };
  const wire: ChatMessage[] = [
    sys,
    ...buildWireHistory(
      pickActiveVariants(history, input.activeVariants ?? {}),
      await listToolMessages(conversationId),
    ),
  ];

  const assistantMessageId = await insertMessage({
    conversation_id: conversationId,
    role: "assistant",
    sender_id: agent.id,
    content: "",
    parent_id: userMessageId,
    in_reply_to_message_id: userMessageId,
  });
  input.onMessageCreated?.(
    localMessage({
      id: assistantMessageId,
      conversation_id: conversationId,
      role: "assistant",
      sender_id: agent.id,
      content: "",
      parent_id: userMessageId,
      in_reply_to_message_id: userMessageId,
    }),
  );

  let acc = "";
  let usage: any = undefined;
  try {
    const result = ctx.conv.runtime === "dsh"
      ? await runDshTurn({
          ctx,
          content,
          conversationId,
          signal,
          onText: (full) => {
            acc = full;
            input.onMessageUpdated?.(assistantMessageId, acc);
          },
        })
      : await getRuntimeClient("legacy").submitTurn({
      base_url: ctx.provider.base_url,
      api_key: ctx.apiKey,
      model: ctx.model,
      messages: wire,
      tools: caps.tools,
      maxRounds: caps.maxRounds,
      knowledgeBaseIds: caps.knowledgeBaseIds,
      temperature: ctx.temperature,
      top_p: ctx.top_p,
      max_tokens: ctx.max_tokens,
      conversationId,
      agentId: agent.id,
      signal,
      approve: input.approve
        ? (c) => input.approve!({ ...c, agentName: agent.name })
        : undefined,
      onText: (full) => {
        acc = full;
        input.onMessageUpdated?.(assistantMessageId, acc);
      },
      });
    acc = result.text;
    usage = result.usage;
    await persistToolMessages({
      conversationId,
      turnId: assistantMessageId,
      senderId: agent.id,
      messages: result.toolMessages,
    });
  } catch (e: any) {
    acc = acc + (acc ? "\n\n" : "") + `*[error: ${e?.message ?? e}]*`;
    input.onMessageUpdated?.(assistantMessageId, acc);
  }

  await updateMessageContent(assistantMessageId, acc, {
    tokens_in: usage?.prompt_tokens,
    tokens_out: usage?.completion_tokens,
  });
  return { userMessageId, assistantMessageId };
}

export interface RegenerateInput extends TurnHost {
  conversationId: string;
  assistantMessageId: string;
  signal?: AbortSignal;
  activeVariants?: Record<string, string>;
}

/**
 * Produce another answer for the same question as a sibling variant, so the
 * user can swipe between them.
 */
export async function regenerateAssistantMessage(
  input: RegenerateInput,
): Promise<string> {
  const { conversationId, assistantMessageId, signal } = input;
  const ctx = await resolveTurn(conversationId);
  const { agent } = ctx;

  const all = await listMessages(conversationId);
  const target = all.find((m) => m.id === assistantMessageId);
  if (!target) throw new Error("Assistant message not found");
  const groupId = target.variant_group_id ?? target.id;
  const sameGroup = all.filter((m) => (m.variant_group_id ?? m.id) === groupId);
  const nextIndex = Math.max(0, ...sameGroup.map((m) => m.variant_index)) + 1;

  const skills = await listAgentSkills(agent.id);
  const lastUser = [...all].reverse().find((m) => m.role === "user");
  const memories = await retrieveMemories(
    agent.id,
    lastUser?.content ?? target.content ?? "",
    5,
  );
  const caps = await resolveAgentTools(agent);
  const sys: ChatMessage = {
    role: "system",
    content: buildSystemPrompt({
      agent,
      skills,
      memories,
      toolNames: caps.tools.map((t) => t.name),
    }),
  };

  // Everything except the group being regenerated; the answer is produced anew.
  const prior = all.filter((m) => (m.variant_group_id ?? m.id) !== groupId);
  const selected = pickActiveVariants(prior, input.activeVariants ?? {});
  selected.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const wire: ChatMessage[] = [
    sys,
    ...buildWireHistory(selected, await listToolMessages(conversationId)),
  ];

  const newMessageId = await insertMessage({
    conversation_id: conversationId,
    role: "assistant",
    sender_id: agent.id,
    content: "",
    parent_id: target.parent_id,
    in_reply_to_message_id: target.in_reply_to_message_id,
    variant_group_id: groupId,
    variant_index: nextIndex,
  });
  input.onMessageCreated?.(
    localMessage({
      id: newMessageId,
      conversation_id: conversationId,
      role: "assistant",
      sender_id: agent.id,
      content: "",
      parent_id: target.parent_id,
      in_reply_to_message_id: target.in_reply_to_message_id,
      variant_group_id: groupId,
      variant_index: nextIndex,
    }),
  );

  let acc = "";
  let usage: any = undefined;
  try {
    const result = ctx.conv.runtime === "dsh"
      ? await runDshTurn({
          ctx,
          content: lastUser?.content ?? "Regenerate the previous answer.",
          conversationId,
          signal,
          onText: (full) => {
            acc = full;
            input.onMessageUpdated?.(newMessageId, acc);
          },
        })
      : await getRuntimeClient("legacy").submitTurn({
      base_url: ctx.provider.base_url,
      api_key: ctx.apiKey,
      model: ctx.model,
      messages: wire,
      tools: caps.tools,
      maxRounds: caps.maxRounds,
      knowledgeBaseIds: caps.knowledgeBaseIds,
      temperature: ctx.temperature,
      top_p: ctx.top_p,
      max_tokens: ctx.max_tokens,
      conversationId,
      agentId: agent.id,
      signal,
      approve: input.approve
        ? (c) => input.approve!({ ...c, agentName: agent.name })
        : undefined,
      onText: (full) => {
        acc = full;
        input.onMessageUpdated?.(newMessageId, acc);
      },
      });
    acc = result.text;
    usage = result.usage;
    await persistToolMessages({
      conversationId,
      turnId: newMessageId,
      senderId: agent.id,
      messages: result.toolMessages,
    });
  } catch (e: any) {
    acc = acc + (acc ? "\n\n" : "") + `*[error: ${e?.message ?? e}]*`;
    input.onMessageUpdated?.(newMessageId, acc);
  }

  await updateMessageContent(newMessageId, acc, {
    tokens_in: usage?.prompt_tokens,
    tokens_out: usage?.completion_tokens,
  });
  return newMessageId;
}

interface DshTurnOptions {
  ctx: TurnContext;
  content: string;
  conversationId: string;
  signal?: AbortSignal;
  onText: (full: string) => void;
}

async function runDshTurn(options: DshTurnOptions) {
  const existing = await getRuntimeSession(options.conversationId);
  const sessionId = existing?.runtime_session_id ?? `shj-${newId()}`;
  if (!existing) {
    await upsertRuntimeSession({
      conversation_id: options.conversationId,
      runtime: "dsh",
      runtime_session_id: sessionId,
      bridge_protocol_version: 1,
      state: "creating",
    });
  }
  try {
    const result = await getRuntimeClient("dsh").submitTurn({
      conversationId: options.conversationId,
      content: options.content,
      sessionId,
      cwd: await invoke<string>("runtime_workspace_path", {
        conversationId: options.conversationId,
      }),
      provider: "deepseek-official",
      model: options.ctx.model,
      baseUrl: options.ctx.provider.base_url,
      apiKey: options.ctx.apiKey,
      maxTokens: options.ctx.max_tokens ?? undefined,
      signal: options.signal,
      onText: options.onText,
    });
    await upsertRuntimeSession({
      conversation_id: options.conversationId,
      runtime: "dsh",
      runtime_session_id: sessionId,
      bridge_protocol_version: 1,
      state: "ready",
    });
    return result;
  } catch (error) {
    await upsertRuntimeSession({
      conversation_id: options.conversationId,
      runtime: "dsh",
      runtime_session_id: sessionId,
      bridge_protocol_version: 1,
      state: "failed",
    });
    throw error;
  }
}
