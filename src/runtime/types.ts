import type { AgentTurnInput, AgentTurnResult, ToolEvent } from "@/features/agentLoop";
import type { AgentRuntime } from "@/types/domain";

export type { AgentRuntime } from "@/types/domain";

export type RuntimeStatus =
  | "unavailable"
  | "stopped"
  | "starting"
  | "ready"
  | "stopping"
  | "crashed";

export interface RuntimeHealth {
  runtime: AgentRuntime;
  status: RuntimeStatus;
  protocolVersion: number;
  runtimeVersion?: string;
  message?: string;
}

export interface DshRuntimeTurnInput {
  conversationId: string;
  content: string;
  sessionId: string;
  cwd: string;
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  maxTokens?: number;
  signal?: AbortSignal;
  onText: (full: string) => void;
  onToolEvent?: (event: ToolEvent) => void;
}

export type RuntimeTurnInput = AgentTurnInput | DshRuntimeTurnInput;

export type RuntimeTurnResult = AgentTurnResult;

export interface RuntimeClient {
  readonly kind: AgentRuntime;

  health(): Promise<RuntimeHealth>;

  submitTurn(input: RuntimeTurnInput): Promise<RuntimeTurnResult>;

  cancelTurn?(turnId: string): Promise<void>;

  respondApproval?(
    approvalId: string,
    decision: "approve" | "deny",
  ): Promise<void>;
}

export function isDshRuntimeTurnInput(
  input: RuntimeTurnInput,
): input is DshRuntimeTurnInput {
  return "content" in input && "sessionId" in input && "cwd" in input;
}

export interface RuntimeToolEvent extends ToolEvent {
  runtime: AgentRuntime;
}