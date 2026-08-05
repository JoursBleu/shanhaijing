/**
 * Ask one prompt to several models at once and stream every answer in parallel.
 *
 * Deliberately ephemeral: comparing models is an evaluation act, not a
 * conversation, so nothing is written to the conversation tables. Each target
 * gets its own AbortController so one slow or broken provider never blocks the
 * rest, and a failure is reported per-target instead of failing the whole run.
 */

import { streamChat, type ChatMessage } from "@/llm/openai";
import { getProvider } from "@/repos/providers";
import { decryptSecret } from "@/lib/crypto";

export interface CompareTarget {
  id: string;
  providerId: string;
  model: string;
}

export interface CompareRunState {
  targetId: string;
  content: string;
  status: "pending" | "streaming" | "done" | "error";
  error?: string;
  /** Wall-clock ms from dispatch to completion. */
  elapsedMs?: number;
  tokensOut?: number;
}

export interface CompareInput {
  targets: CompareTarget[];
  prompt: string;
  system?: string;
  temperature?: number;
  signal?: AbortSignal;
  onUpdate: (state: CompareRunState) => void;
}

export async function runCompare(input: CompareInput): Promise<void> {
  await Promise.all(
    input.targets.map((target) => runOne(target, input)),
  );
}

async function runOne(
  target: CompareTarget,
  input: CompareInput,
): Promise<void> {
  const started = performance.now();
  const emit = (patch: Partial<CompareRunState>, content: string) =>
    input.onUpdate({
      targetId: target.id,
      content,
      status: "streaming",
      ...patch,
    });

  let acc = "";
  try {
    const provider = await getProvider(target.providerId);
    if (!provider) throw new Error("provider 已被删除");
    const api_key = await decryptSecret(provider.api_key_encrypted);

    const messages: ChatMessage[] = [];
    if (input.system?.trim()) {
      messages.push({ role: "system", content: input.system });
    }
    messages.push({ role: "user", content: input.prompt });

    let tokensOut: number | undefined;
    for await (const chunk of streamChat({
      base_url: provider.base_url,
      api_key,
      model: target.model,
      messages,
      temperature: input.temperature,
      signal: input.signal,
    })) {
      if (chunk.usage?.completion_tokens) {
        tokensOut = chunk.usage.completion_tokens;
      }
      if (chunk.delta) {
        acc += chunk.delta;
        emit({}, acc);
      }
    }
    input.onUpdate({
      targetId: target.id,
      content: acc,
      status: "done",
      elapsedMs: Math.round(performance.now() - started),
      tokensOut,
    });
  } catch (e: any) {
    input.onUpdate({
      targetId: target.id,
      content: acc,
      status: "error",
      error: e?.message ?? String(e),
      elapsedMs: Math.round(performance.now() - started),
    });
  }
}
