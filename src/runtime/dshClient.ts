import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ToolEvent } from "@/features/agentLoop";
import {
  isDshRuntimeTurnInput,
  RuntimeClient,
  RuntimeHealth,
  RuntimeTurnInput,
  RuntimeTurnResult,
} from "@/runtime/types";

const BRIDGE_PROTOCOL_VERSION = 1;

interface SidecarStatus {
  status: RuntimeHealth["status"];
  protocolVersion: number;
  pid?: number;
  startedAtMs?: number;
  message?: string;
  serverVersion?: string;
}

interface RpcNotificationFrame {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

export class DshRuntimeClient implements RuntimeClient {
  readonly kind = "dsh" as const;
  private initializedRoute: string | null = null;
  private activeSessionId: string | null = null;

  async health(): Promise<RuntimeHealth> {
    try {
      const status = await invoke<SidecarStatus>("runtime_status");
      return { runtime: this.kind, ...status };
    } catch (error) {
      return {
        runtime: this.kind,
        status: "unavailable",
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        message: errorMessage(error),
      };
    }
  }

  async start(): Promise<RuntimeHealth> {
    const status = await invoke<SidecarStatus>("runtime_start");
    return { runtime: this.kind, ...status };
  }

  async stop(): Promise<RuntimeHealth> {
    this.activeSessionId = null;
    this.initializedRoute = null;
    const status = await invoke<SidecarStatus>("runtime_stop");
    return { runtime: this.kind, ...status };
  }

  async submitTurn(input: RuntimeTurnInput): Promise<RuntimeTurnResult> {
    if (!isDshRuntimeTurnInput(input)) {
      throw new Error("DeepSeek Harness runtime received a legacy turn");
    }
    if (this.activeSessionId !== null) {
      throw new Error("DeepSeek Harness is already running a turn");
    }

    await this.ensureInitialized(input);
    const events: ToolEvent[] = [];
    let text = "";
    let completed = false;
    let failure: Error | null = null;
    let resolveIdle!: () => void;
    const idle = new Promise<void>((resolve) => {
      resolveIdle = resolve;
    });

    let unlisten: UnlistenFn | undefined;
    const onAbort = (): void => {
      failure = new Error("DeepSeek Harness turn cancelled by closing the runtime");
      void this.stop().finally(resolveIdle);
    };
    try {
      this.activeSessionId = input.sessionId;
      unlisten = await listen<RpcNotificationFrame>(
        "dsh://notification",
        ({ payload }) => {
          const params = payload.params ?? {};
          if (payload.method === "runtime.crashed") {
            failure = new Error(String(params.message ?? "DeepSeek Harness crashed"));
            resolveIdle();
            return;
          }
          if (params.sessionId !== input.sessionId) return;
          if (payload.method === "session.event") {
            const event = params.event;
            if (!isRecord(event)) return;
            if (event.type === "assistant/chunk") {
              const delta = assistantChunkText(event);
              if (delta) {
                text += delta;
                input.onText(text);
              }
            } else if (event.type === "assistant/message") {
              const committed = assistantMessageText(event);
              if (committed) {
                text = committed;
                input.onText(text);
              }
            } else if (event.type === "tool/call") {
              const tool = toolEvent(event, "call");
              if (tool) {
                events.push(tool);
                input.onToolEvent?.(tool);
              }
            } else if (event.type === "tool/result") {
              const tool = toolEvent(event, "result");
              if (tool) {
                events.push(tool);
                input.onToolEvent?.(tool);
              }
            } else if (event.type === "turn/end") {
              completed = true;
            }
          } else if (payload.method === "session.status" && params.status === "idle") {
            resolveIdle();
          }
        },
      );
      input.signal?.addEventListener("abort", onAbort, { once: true });
      await invoke("runtime_prompt", {
        input: {
          sessionId: input.sessionId,
          contentBlocks: [{ type: "text", text: input.content }],
        },
      });
      await idle;
      if (failure) throw failure;
      if (!completed && !text) {
        throw new Error("DeepSeek Harness became idle without an assistant response");
      }
      return {
        text,
        rounds: 1,
        toolTrace: events,
        toolMessages: [],
      };
    } finally {
      input.signal?.removeEventListener("abort", onAbort);
      unlisten?.();
      this.activeSessionId = null;
    }
  }

  async cancelTurn(_turnId: string): Promise<void> {
    if (this.activeSessionId !== null) await this.stop();
  }

  private async ensureInitialized(input: {
    cwd: string;
    provider: string;
    model: string;
    baseUrl: string;
    apiKey: string;
    maxTokens?: number;
  }): Promise<void> {
    const route = JSON.stringify([
      input.cwd,
      input.provider,
      input.model,
      input.baseUrl,
      input.apiKey,
      input.maxTokens ?? null,
    ]);
    if (this.initializedRoute === route) return;
    if (this.initializedRoute !== null) await this.stop();
    const status = await invoke<SidecarStatus>("runtime_initialize", {
      input: {
        cwd: input.cwd,
        provider: input.provider,
        model: input.model,
        maxTokens: input.maxTokens,
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
      },
    });
    if (status.status !== "ready") {
      throw new Error(status.message ?? "DeepSeek Harness failed to initialize");
    }
    this.initializedRoute = route;
  }
}

function assistantChunkText(event: Record<string, unknown>): string {
  const data = isRecord(event.data) ? event.data : {};
  const chunk = isRecord(data.chunk) ? data.chunk : data;
  if (chunk.type === "text-delta" && typeof chunk.text === "string") {
    return chunk.text;
  }
  if (typeof chunk.text === "string") return chunk.text;
  if (typeof chunk.delta === "string") return chunk.delta;
  const content = Array.isArray(chunk.content) ? chunk.content : [];
  return content
    .filter((block) => isRecord(block) && block.type === "text")
    .map((block) => String(block.text ?? ""))
    .join("");
}

function assistantMessageText(event: Record<string, unknown>): string {
  const data = isRecord(event.data) ? event.data : {};
  const message = isRecord(data.message) ? data.message : {};
  const content = Array.isArray(message.content) ? message.content : [];
  return content
    .filter((block) => isRecord(block) && block.type === "text")
    .map((block) => String(block.text ?? ""))
    .join("");
}

function toolEvent(
  event: Record<string, unknown>,
  kind: "call" | "result",
): ToolEvent | null {
  const data = isRecord(event.data) ? event.data : {};
  const call = isRecord(data.call) ? data.call : data;
  const name = call.name ?? data.name ?? data.toolName;
  if (typeof name !== "string") return null;
  if (kind === "call") return { kind, name, args: call.arguments ?? call.args };
  const message = isRecord(data.message) ? data.message : {};
  const content = Array.isArray(message.content) ? message.content : [];
  const output = content
    .filter((block) => isRecord(block) && block.type === "tool-result")
    .flatMap((block) => (Array.isArray(block.content) ? block.content : []))
    .filter((block) => isRecord(block) && block.type === "text")
    .map((block) => String(block.text ?? ""))
    .join("");
  return {
    kind,
    name,
    output:
      output || (typeof data.output === "string"
        ? data.output
        : JSON.stringify(data.result ?? data.content ?? "")),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}