import { useEffect, useState } from "react";
import { useData } from "@/stores/data";
import {
  listMemoriesForAgent,
  createMemory,
  updateMemory,
  deleteMemory,
} from "@/repos/memories";
import type { Memory, MemoryKind } from "@/types/domain";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";

const KIND_LABEL: Record<MemoryKind, string> = {
  summary: "摘要",
  fact: "事实",
  preference: "偏好",
};

const KIND_OPTIONS: MemoryKind[] = ["fact", "preference", "summary"];

export function MemoriesPanel() {
  const agents = useData((s) => s.agents);
  const [agentId, setAgentId] = useState<string>("");
  const [items, setItems] = useState<Memory[]>([]);
  const [draftContent, setDraftContent] = useState("");
  const [draftKind, setDraftKind] = useState<MemoryKind>("fact");
  const [draftImportance, setDraftImportance] = useState(0.6);

  useEffect(() => {
    if (!agentId && agents.length > 0) setAgentId(agents[0]!.id);
  }, [agents, agentId]);

  async function reload() {
    if (!agentId) return setItems([]);
    setItems(await listMemoriesForAgent(agentId, { limit: 200 }));
  }
  useEffect(() => {
    reload();
  }, [agentId]);

  async function addOne() {
    if (!agentId || !draftContent.trim()) return;
    await createMemory({
      agent_id: agentId,
      kind: draftKind,
      content: draftContent.trim(),
      importance: draftImportance,
    });
    setDraftContent("");
    await reload();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-[var(--color-text-1)]">🧠 记忆</h1>
      <p className="text-sm text-[var(--color-text-3)]">
        每个 agent 都有自己的小本子。聊完后点对话顶部的 "💾 沉淀为记忆"
        会让模型自动抽取摘要 / 事实 / 偏好；也可以在这里手动增删改。下次发消息时，
        和当前话题最相关的若干条会被注入到 system prompt。
      </p>

      <Field label="选择 Agent">
        <select
          className="bg-[var(--color-bg-1)] border border-[var(--color-border)] rounded px-2 py-1 text-sm w-full"
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
        >
          {agents.length === 0 && <option>(还没有 agent)</option>}
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>

      {agentId && (
        <>
          <div className="rounded border border-[var(--color-border)] p-3 space-y-2 bg-[var(--color-bg-1)]/40">
            <div className="text-xs text-[var(--color-text-3)]">手动添加</div>
            <div className="flex gap-2">
              <select
                className="bg-[var(--color-bg-1)] border border-[var(--color-border)] rounded px-2 py-1 text-sm"
                value={draftKind}
                onChange={(e) => setDraftKind(e.target.value as MemoryKind)}
              >
                {KIND_OPTIONS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={draftImportance}
                onChange={(e) => setDraftImportance(Number(e.target.value))}
                className="w-20 bg-[var(--color-bg-1)] border border-[var(--color-border)] rounded px-2 py-1 text-sm"
                title="重要度 0-1"
              />
            </div>
            <Textarea
              rows={2}
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              placeholder="一条简短的事实或偏好…"
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={addOne} disabled={!draftContent.trim()}>
                添加
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {items.length === 0 && (
              <div className="text-sm text-[var(--color-text-3)] italic">
                还没有记忆条目。
              </div>
            )}
            {items.map((m) => (
              <MemoryRow key={m.id} memory={m} onChanged={reload} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MemoryRow({
  memory,
  onChanged,
}: {
  memory: Memory;
  onChanged: () => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(memory.content);
  const [kind, setKind] = useState<MemoryKind>(memory.kind);
  const [importance, setImportance] = useState(memory.importance);

  async function save() {
    await updateMemory(memory.id, { content, kind, importance });
    setEditing(false);
    await onChanged();
  }

  async function del() {
    if (!confirm("删除这条记忆？")) return;
    await deleteMemory(memory.id);
    await onChanged();
  }

  return (
    <div className="rounded border border-[var(--color-border)] p-2 text-sm">
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-3)]">
        <span className="px-1.5 py-0.5 rounded bg-[var(--color-bg-1)]">
          {KIND_LABEL[memory.kind]}
        </span>
        <span>★ {memory.importance.toFixed(1)}</span>
        <span>{new Date(memory.created_at + "Z").toLocaleString()}</span>
        <span className="flex-1" />
        {!editing && (
          <button onClick={() => setEditing(true)} className="hover:text-[var(--color-text-1)]">
            编辑
          </button>
        )}
        <button onClick={del} className="hover:text-[var(--color-danger)]">
          删除
        </button>
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <select
              className="bg-[var(--color-bg-1)] border border-[var(--color-border)] rounded px-2 py-1 text-xs"
              value={kind}
              onChange={(e) => setKind(e.target.value as MemoryKind)}
            >
              {KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={importance}
              onChange={(e) => setImportance(Number(e.target.value))}
              className="w-20 bg-[var(--color-bg-1)] border border-[var(--color-border)] rounded px-2 py-1 text-xs"
            />
          </div>
          <Textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              取消
            </Button>
            <Button size="sm" onClick={save}>
              保存
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-1 whitespace-pre-wrap text-[var(--color-text-1)]">
          {memory.content}
        </div>
      )}
    </div>
  );
}
