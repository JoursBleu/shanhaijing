import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import {
  runCommand,
  DEFAULT_TIMEOUT_MS,
  type ExecBackend,
  type ExecBackendKind,
} from "@/features/exec";
import { loadExecBackend, saveExecBackend } from "@/features/execConfig";

const SELECT_CLS =
  "h-9 w-full rounded-md bg-[var(--color-bg-3)] px-2.5 text-sm text-[var(--color-text-1)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]";

const TARGET_HINT: Record<ExecBackendKind, string> = {
  local: "（不需要）",
  wsl: "发行版名，留空用默认，如 Ubuntu-24.04",
  docker: "镜像名，如 python:3.12-slim",
  ssh: "SSH 目标，如 halo-win 或 user@host",
};

export function ExecPanel() {
  const [enabled, setEnabled] = useState(false);
  const [kind, setKind] = useState<ExecBackendKind>("wsl");
  const [target, setTarget] = useState("");
  const [cwd, setCwd] = useState("");
  const [timeoutSec, setTimeoutSec] = useState(DEFAULT_TIMEOUT_MS / 1000);
  const [probe, setProbe] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    loadExecBackend().then((b) => {
      if (!b) return;
      setEnabled(true);
      setKind(b.kind);
      setTarget(b.target ?? "");
      setCwd(b.cwd ?? "");
      setTimeoutSec((b.timeoutMs ?? DEFAULT_TIMEOUT_MS) / 1000);
    });
  }, []);

  function current(): ExecBackend {
    return {
      kind,
      target: target.trim() || null,
      cwd: cwd.trim() || null,
      timeoutMs: Math.max(1, timeoutSec) * 1000,
    };
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await saveExecBackend(enabled ? current() : null);
      setMsg(enabled ? "已保存，agent 现在可以调用 run_command" : "已关闭执行能力");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setProbe(null);
    try {
      const r = await runCommand(current(), "uname -a || ver");
      setProbe(
        `exit=${r.timedOut ? "timeout" : r.code}\n${r.stdout || r.stderr || "(无输出)"}`,
      );
    } catch (e: any) {
      setProbe(`失败：${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-1)]">
          执行环境
        </h2>
        <p className="text-xs text-[var(--color-text-3)]">
          配置后 agent 才会拿到 <code>run_command</code> 工具；未配置时该工具
          根本不会出现在模型可用列表里。
        </p>
      </div>

      <div className="border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/5 rounded p-3 space-y-1">
        <div className="text-sm font-medium text-[var(--color-danger)]">
          先读这段再开
        </div>
        <p className="text-xs text-[var(--color-text-2)]">
          模型会被它读到的东西牵着走。知识库里的一段文本、网页搜索的一条结果、
          MCP 返回的一段内容，都可能包含「请执行以下命令」——这条链路是真实的
          任意代码执行路径，不是理论风险。
        </p>
        <p className="text-xs text-[var(--color-text-2)]">
          所以默认推荐 <b>WSL / Docker / SSH 到一台可弃的机器</b>，而不是
          <code>local</code>。Docker 后端已默认加 <code>--network none</code> 与
          <code>--rm</code>。每次调用仍需你点确认。
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span>启用执行能力</span>
      </label>

      {enabled && (
        <div className="space-y-2 border border-[var(--color-border)] rounded p-3">
          <Field label="后端">
            <select
              className={SELECT_CLS}
              value={kind}
              onChange={(e) => setKind(e.target.value as ExecBackendKind)}
            >
              <option value="wsl">WSL（推荐，Windows 上现成）</option>
              <option value="docker">Docker（隔离最强，无网络）</option>
              <option value="ssh">SSH 到远程主机</option>
              <option value="local">本机 shell（不隔离，风险自负）</option>
            </select>
          </Field>

          {kind !== "local" && (
            <Field label="目标" hint={TARGET_HINT[kind]}>
              <Input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={TARGET_HINT[kind]}
              />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Field label="工作目录（可选）">
              <Input value={cwd} onChange={(e) => setCwd(e.target.value)} />
            </Field>
            <Field label="超时（秒）">
              <Input
                type="number"
                value={timeoutSec}
                onChange={(e) => setTimeoutSec(Number(e.target.value) || 60)}
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={test} disabled={busy}>
              {busy ? "测试中…" : "测试连通"}
            </Button>
            <Button onClick={save} disabled={busy}>
              保存
            </Button>
          </div>

          {probe && (
            <pre className="text-xs bg-[var(--color-bg-3)] rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap">
              {probe}
            </pre>
          )}
        </div>
      )}

      {!enabled && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={busy}>
            保存
          </Button>
        </div>
      )}

      {msg && <div className="text-xs text-[var(--color-success)]">{msg}</div>}
    </div>
  );
}
