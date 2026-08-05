import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { useData } from "@/stores/data";
import { listModels } from "@/repos/providers";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { newId } from "@/lib/id";
import {
  runCompare,
  type CompareRunState,
  type CompareTarget,
} from "@/features/multiModel";

const SELECT_CLS =
  "h-9 w-full rounded-md bg-[var(--color-bg-3)] px-2.5 text-sm text-[var(--color-text-1)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]";

export function ComparePanel() {
  const allProviders = useData((s) => s.providers);
  const providers = useMemo(
    () => allProviders.filter((p) => p.enabled),
    [allProviders],
  );
  const [targets, setTargets] = useState<CompareTarget[]>([]);
  const [prompt, setPrompt] = useState("");
  const [system, setSystem] = useState("");
  const [runs, setRuns] = useState<Record<string, CompareRunState>>({});
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (targets.length === 0 && providers[0]) {
      setTargets([
        { id: newId(), providerId: providers[0].id, model: "" },
        { id: newId(), providerId: providers[0].id, model: "" },
      ]);
    }
  }, [providers.length]);

  const ready = prompt.trim() && targets.some((t) => t.model.trim());

  async function start() {
    if (!ready || running) return;
    const active = targets.filter((t) => t.model.trim());
    const ac = new AbortController();
    abortRef.current = ac;
    setRunning(true);
    setRuns(
      Object.fromEntries(
        active.map((t) => [
          t.id,
          { targetId: t.id, content: "", status: "pending" as const },
        ]),
      ),
    );
    try {
      await runCompare({
        targets: active,
        prompt,
        system,
        signal: ac.signal,
        onUpdate: (s) => setRuns((prev) => ({ ...prev, [s.targetId]: s })),
      });
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-1)]">
          多模型同问
        </h2>
        <p className="text-xs text-[var(--color-text-3)]">
          同一个问题并发问多个模型，横向对比答案、耗时和输出长度。结果不写入对话记录。
        </p>
      </div>

      <div className="space-y-2 border border-[var(--color-border)] rounded p-3">
        <Field label="System（可选，所有模型共用）">
          <Textarea
            rows={2}
            value={system}
            onChange={(e) => setSystem(e.target.value)}
            placeholder="给所有被测模型同样的系统提示…"
          />
        </Field>
        <Field label="问题">
          <Textarea
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="要同时问的问题…"
          />
        </Field>

        <div className="space-y-1">
          <div className="text-xs text-[var(--color-text-3)]">参与对比的模型</div>
          {targets.map((t) => (
            <TargetRow
              key={t.id}
              target={t}
              onChange={(next) =>
                setTargets((ts) => ts.map((x) => (x.id === t.id ? next : x)))
              }
              onRemove={
                targets.length > 1
                  ? () => setTargets((ts) => ts.filter((x) => x.id !== t.id))
                  : undefined
              }
            />
          ))}
          <Button
            variant="ghost"
            onClick={() =>
              setTargets((ts) => [
                ...ts,
                {
                  id: newId(),
                  providerId: providers[0]?.id ?? "",
                  model: "",
                },
              ])
            }
          >
            + 添加模型
          </Button>
        </div>

        <div className="flex justify-end gap-2">
          {running && (
            <Button variant="ghost" onClick={stop}>
              停止
            </Button>
          )}
          <Button onClick={start} disabled={!ready || running}>
            {running ? "生成中…" : "同时提问"}
          </Button>
        </div>
      </div>

      <ResultGrid targets={targets} runs={runs} />
    </div>
  );
}

function TargetRow({
  target,
  onChange,
  onRemove,
}: {
  target: CompareTarget;
  onChange: (t: CompareTarget) => void;
  onRemove?: () => void;
}) {
  const allProviders = useData((s) => s.providers);
  const providers = useMemo(
    () => allProviders.filter((p) => p.enabled),
    [allProviders],
  );
  const [models, setModels] = useState<string[]>([]);

  useEffect(() => {
    if (!target.providerId) return setModels([]);
    listModels(target.providerId).then((rows) =>
      setModels(rows.map((r) => r.name)),
    );
  }, [target.providerId]);

  return (
    <div className="flex items-center gap-2">
      <select
        className={SELECT_CLS + " flex-1"}
        value={target.providerId}
        onChange={(e) =>
          onChange({ ...target, providerId: e.target.value, model: "" })
        }
      >
        {providers.length === 0 && <option value="">（无可用 provider）</option>}
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <select
        className={SELECT_CLS + " flex-1"}
        value={target.model}
        onChange={(e) => onChange({ ...target, model: e.target.value })}
      >
        <option value="">（选模型）</option>
        {models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <button
        className="text-xs text-[var(--color-text-3)] hover:text-[var(--color-danger)] disabled:opacity-30"
        onClick={onRemove}
        disabled={!onRemove}
      >
        移除
      </button>
    </div>
  );
}

function ResultGrid({
  targets,
  runs,
}: {
  targets: CompareTarget[];
  runs: Record<string, CompareRunState>;
}) {
  const shown = useMemo(
    () => targets.filter((t) => runs[t.id]),
    [targets, runs],
  );
  if (shown.length === 0) return null;

  return (
    <div
      className="grid gap-3"
      style={{
        gridTemplateColumns: `repeat(${Math.min(shown.length, 3)}, minmax(0, 1fr))`,
      }}
    >
      {shown.map((t) => {
        const run = runs[t.id]!;
        return (
          <div
            key={t.id}
            className="border border-[var(--color-border)] rounded flex flex-col min-h-[12rem]"
          >
            <div className="px-2 py-1.5 border-b border-[var(--color-border)] flex items-center gap-2">
              <div className="text-xs font-medium truncate text-[var(--color-text-1)]">
                {t.model}
              </div>
              <div className="flex-1" />
              <div className="text-xs text-[var(--color-text-3)] shrink-0">
                {run.status === "streaming" && "…"}
                {run.status === "done" &&
                  `${((run.elapsedMs ?? 0) / 1000).toFixed(1)}s${
                    run.tokensOut ? ` · ${run.tokensOut} tok` : ""
                  }`}
                {run.status === "error" && "失败"}
              </div>
            </div>
            <div className="p-2 text-sm overflow-auto max-h-[28rem] prose-shanhaijing">
              {run.status === "error" ? (
                <div className="text-xs text-[var(--color-danger)]">
                  {run.error}
                </div>
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex, rehypeHighlight]}
                >
                  {run.content || "…"}
                </ReactMarkdown>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
