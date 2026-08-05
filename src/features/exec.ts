/**
 * Command execution backends.
 *
 * Hermes ships six of these (local/docker/ssh/modal/daytona/singularity) and
 * OpenHands isolates in Docker for one reason: an LLM driving a shell, steered
 * by text it just retrieved, is a path to arbitrary code execution. So the
 * backend is data, not a hardcoded call — swapping isolation must not mean
 * rewriting the tool.
 *
 * `local` is deliberately not the default.
 */

import { Command } from "@tauri-apps/plugin-shell";

export type ExecBackendKind = "local" | "wsl" | "docker" | "ssh";

export interface ExecBackend {
  kind: ExecBackendKind;
  /** WSL distro, docker image, or ssh destination depending on `kind`. */
  target?: string | null;
  /** Working directory inside the backend. */
  cwd?: string | null;
  timeoutMs?: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
}

export const DEFAULT_TIMEOUT_MS = 60_000;
/** Truncation guard: a runaway command must not blow up the context window. */
const MAX_OUTPUT = 20_000;

/**
 * Build the argv that actually gets spawned. Everything is passed as separate
 * arguments rather than interpolated into a string — the command reaches the
 * inner shell as a single argv element, so quoting in the model's output can't
 * escape into the outer one.
 */
function buildArgv(backend: ExecBackend, command: string): [string, string[]] {
  switch (backend.kind) {
    case "wsl": {
      const args: string[] = [];
      if (backend.target) args.push("-d", backend.target);
      if (backend.cwd) args.push("--cd", backend.cwd);
      args.push("--", "bash", "-lc", command);
      return ["wsl", args];
    }
    case "docker": {
      const image = backend.target;
      if (!image) throw new Error("docker backend needs an image");
      const args = ["run", "--rm", "-i", "--network", "none"];
      if (backend.cwd) args.push("-w", backend.cwd);
      args.push(image, "bash", "-lc", command);
      return ["docker", args];
    }
    case "ssh": {
      const dest = backend.target;
      if (!dest) throw new Error("ssh backend needs a destination");
      const inner = backend.cwd
        ? `cd ${shellQuote(backend.cwd)} && ${command}`
        : command;
      return ["ssh", ["-o", "BatchMode=yes", dest, inner]];
    }
    case "local":
    default: {
      const args = backend.cwd
        ? ["-lc", `cd ${shellQuote(backend.cwd)} && ${command}`]
        : ["-lc", command];
      return ["bash", args];
    }
  }
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function clamp(s: string): string {
  return s.length > MAX_OUTPUT
    ? s.slice(0, MAX_OUTPUT) + `\n…[truncated, ${s.length} bytes total]`
    : s;
}

export async function runCommand(
  backend: ExecBackend,
  command: string,
  signal?: AbortSignal,
): Promise<ExecResult> {
  const [program, args] = buildArgv(backend, command);
  const cmd = Command.create(program, args);

  let stdout = "";
  let stderr = "";
  cmd.stdout.on("data", (line) => {
    stdout += line;
  });
  cmd.stderr.on("data", (line) => {
    stderr += line;
  });

  const child = await cmd.spawn();
  const timeoutMs = backend.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timedOut = false;

  const code = await new Promise<number | null>((resolve) => {
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill().catch(() => {});
      resolve(null);
    }, timeoutMs);

    const onAbort = () => {
      child.kill().catch(() => {});
      clearTimeout(timer);
      resolve(null);
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    cmd.on("close", ({ code }) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(code);
    });
    cmd.on("error", () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(null);
    });
  });

  return {
    stdout: clamp(stdout),
    stderr: clamp(stderr),
    code,
    timedOut,
  };
}
