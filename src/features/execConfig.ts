/**
 * Where `run_command` runs. Stored in `app_settings` rather than per agent —
 * it is a property of the machine, not of a persona.
 *
 * Absent config means execution is off. That is the intended default: the tool
 * fails closed rather than silently falling back to the user's own shell.
 */

import { getSetting, setSetting } from "@/repos/settings";
import type { ExecBackend, ExecBackendKind } from "@/features/exec";
import { DEFAULT_TIMEOUT_MS } from "@/features/exec";

const K = "exec.backend";

export async function loadExecBackend(): Promise<ExecBackend | null> {
  const raw = await getSetting(K);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!isExecBackendKind(v?.kind)) return null;
    return {
      kind: v.kind as ExecBackendKind,
      target: v.target ?? null,
      cwd: v.cwd ?? null,
      timeoutMs: Number(v.timeoutMs) || DEFAULT_TIMEOUT_MS,
    };
  } catch {
    return null;
  }
}

function isExecBackendKind(value: unknown): value is ExecBackendKind {
  return value === "local" || value === "wsl" || value === "docker" || value === "ssh";
}

export async function saveExecBackend(b: ExecBackend | null): Promise<void> {
  await setSetting(K, b ? JSON.stringify(b) : "");
}
