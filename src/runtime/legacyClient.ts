import { runAgentTurn } from "@/features/agentLoop";
import type { AgentTurnInput } from "@/features/agentLoop";
import type {
  RuntimeClient,
  RuntimeHealth,
  RuntimeTurnInput,
  RuntimeTurnResult,
} from "@/runtime/types";
import { isDshRuntimeTurnInput } from "@/runtime/types";

export class LegacyRuntimeClient implements RuntimeClient {
  readonly kind = "legacy" as const;

  async health(): Promise<RuntimeHealth> {
    return {
      runtime: this.kind,
      status: "ready",
      protocolVersion: 1,
      runtimeVersion: "built-in",
    };
  }

  submitTurn(input: RuntimeTurnInput): Promise<RuntimeTurnResult> {
    if (isDshRuntimeTurnInput(input)) {
      return Promise.reject(new Error("Legacy runtime received a DSH turn"));
    }
    return runAgentTurn(input as AgentTurnInput);
  }
}