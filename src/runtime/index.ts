import { DshRuntimeClient } from "@/runtime/dshClient";
import { LegacyRuntimeClient } from "@/runtime/legacyClient";
import type { AgentRuntime, RuntimeClient } from "@/runtime/types";

const clients: Record<AgentRuntime, RuntimeClient> = {
  legacy: new LegacyRuntimeClient(),
  dsh: new DshRuntimeClient(),
};

export function getRuntimeClient(runtime: AgentRuntime): RuntimeClient {
  return clients[runtime];
}

export function getDshRuntimeClient(): DshRuntimeClient {
  return clients.dsh as DshRuntimeClient;
}

export type {
  AgentRuntime,
  RuntimeClient,
  RuntimeHealth,
  RuntimeStatus,
  RuntimeTurnInput,
  RuntimeTurnResult,
} from "@/runtime/types";