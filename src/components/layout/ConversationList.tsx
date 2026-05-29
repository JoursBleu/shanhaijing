import { useState } from "react";
import { useData } from "@/stores/data";
import { useUI } from "@/stores/ui";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import {
  createConversation,
  deleteConversation,
} from "@/repos/conversations";

type Kind = "private" | "casual" | "work";

export function ConversationList() {
  const conversations = useData((s) => s.conversations);
  const agents = useData((s) => s.agents);
  const reloadConversations = useData((s) => s.reloadConversations);
  const reloadConvAgents = useData((s) => s.reloadConvAgents);
  const view = useUI((s) => s.view);
  const setView = useUI((s) => s.setView);
  const activePersonaId = useUI((s) => s.activePersonaId);
  const personas = useData((s) => s.personas);

  const [newOpen, setNewOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("private");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [taskGoal, setTaskGoal] = useState("");
  const [initialResponder, setInitialResponder] = useState<string>("");

  const personaOk =
    !!activePersonaId && !!personas.find((p) => p.id === activePersonaId);

  function resetForm() {
    setKind("private");
    setSelectedIds([]);
    setTitle("");
    setTaskGoal("");
    setInitialResponder("");
  }

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const valid =
    personaOk &&
    ((kind === "private" && selectedIds.length === 1) ||
      (kind !== "private" && selectedIds.length >= 2));

  async function startNew() {
    if (!valid || !activePersonaId) return;
    const firstAgentName =
      agents.find((a) => a.id === selectedIds[0])?.name ?? "新对话";
    const defaultTitle =
      kind === "private"
        ? `与 ${firstAgentName} 的对话`
        : kind === "work"
          ? taskGoal.slice(0, 32) || "工作群"
          : "闲聊群";
    const id = await createConversation({
      kind,
      title: title || defaultTitle,
      user_persona_id: activePersonaId,
      agent_ids: selectedIds,
      task_goal: kind === "work" ? taskGoal || null : null,
      initial_responder: initialResponder || selectedIds[0] || null,
    });
    await reloadConversations();
    await reloadConvAgents(id);
    setView({ kind: "conversation", id });
    setNewOpen(false);
    resetForm();
  }

  async function remove(id: string) {
    if (!confirm("删除这段对话？")) return;
    await deleteConversation(id);
    await reloadConversations();
    if (view.kind === "conversation" && view.id === id) {
      setView({ kind: "welcome" });
    }
  }

  function badgeFor(k: string) {
    if (k === "work") return "工";
    if (k === "casual") return "群";
    return "";
  }

  return (
    <aside className="w-[240px] shrink-0 bg-[var(--color-bg-1)] border-r border-[var(--color-border)] flex flex-col">
      <header className="h-12 px-3 flex items-center justify-between border-b border-[var(--color-border)] font-semibold">
        <span>山海经</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setNewOpen(true)}
          title="新对话"
          disabled={!agents.length}
        >
          +
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-2 text-sm space-y-0.5">
        {conversations.length === 0 ? (
          <div className="px-2 py-1.5 text-[var(--color-text-3)]">
            {agents.length === 0
              ? "先在 👥 里建一个 agent"
              : '点上方的 "+" 开始'}
          </div>
        ) : (
          conversations.map((c) => {
            const isActive =
              view.kind === "conversation" && view.id === c.id;
            const badge = badgeFor(c.kind);
            return (
              <div
                key={c.id}
                onClick={() => setView({ kind: "conversation", id: c.id })}
                className={cn(
                  "group px-2 py-1.5 rounded cursor-pointer flex items-center gap-2",
                  isActive
                    ? "bg-[var(--color-bg-3)] text-[var(--color-text-1)]"
                    : "text-[var(--color-text-2)] hover:bg-[var(--color-bg-3)]",
                )}
              >
                {badge && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-[var(--color-accent)]/30 text-[var(--color-accent)]">
                    {badge}
                  </span>
                )}
                <span className="flex-1 truncate">
                  {c.title || "(未命名)"}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(c.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-[var(--color-text-3)] hover:text-[var(--color-danger)] text-xs"
                >
                  ×
                </button>
              </div>
            );
          })
        )}
      </div>

      <Modal
        open={newOpen}
        title="新对话"
        onClose={() => {
          setNewOpen(false);
          resetForm();
        }}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setNewOpen(false);
                resetForm();
              }}
            >
              取消
            </Button>
            <Button onClick={startNew} disabled={!valid}>
              开始
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {!personaOk && (
            <div className="text-xs text-[var(--color-warning)]">
              请先在 🪪 我的身份 里选一个身份。
            </div>
          )}

          <Field label="类型">
            <div className="flex gap-2">
              {(["private", "casual", "work"] as Kind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setKind(k);
                    if (k === "private") setSelectedIds(selectedIds.slice(0, 1));
                  }}
                  className={cn(
                    "flex-1 h-9 rounded-md text-sm",
                    kind === k
                      ? "bg-[var(--color-accent)] text-white"
                      : "bg-[var(--color-bg-3)] text-[var(--color-text-2)]",
                  )}
                >
                  {k === "private" ? "私聊" : k === "casual" ? "闲聊群" : "工作群"}
                </button>
              ))}
            </div>
          </Field>

          <Field
            label={kind === "private" ? "选一个 agent" : "选 2 个以上 agent"}
          >
            <div className="space-y-1 max-h-48 overflow-auto border border-[var(--color-border)] rounded p-2">
              {agents.length === 0 ? (
                <div className="text-xs text-[var(--color-text-3)]">
                  还没有 agent。
                </div>
              ) : (
                agents.map((a) => {
                  const checked = selectedIds.includes(a.id);
                  return (
                    <label
                      key={a.id}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <input
                        type={kind === "private" ? "radio" : "checkbox"}
                        name="agent-pick"
                        checked={checked}
                        onChange={() => {
                          if (kind === "private") {
                            setSelectedIds([a.id]);
                          } else {
                            toggle(a.id);
                          }
                        }}
                      />
                      <span>{a.name}</span>
                      {a.signature && (
                        <span className="text-xs text-[var(--color-text-3)] truncate">
                          — {a.signature}
                        </span>
                      )}
                    </label>
                  );
                })
              )}
            </div>
          </Field>

          {kind !== "private" && selectedIds.length >= 2 && (
            <Field label="第一个发言的 agent">
              <select
                className="h-9 w-full rounded-md bg-[var(--color-bg-3)] px-2.5 text-sm"
                value={initialResponder}
                onChange={(e) => setInitialResponder(e.target.value)}
              >
                <option value="">（默认第一个被选中的）</option>
                {selectedIds.map((id) => {
                  const a = agents.find((x) => x.id === id);
                  return (
                    <option key={id} value={id}>
                      {a?.name ?? id}
                    </option>
                  );
                })}
              </select>
            </Field>
          )}

          {kind === "work" && (
            <Field
              label="任务目标"
              hint="agent 满足后会发出 <done/> 自动收尾"
            >
              <Textarea
                rows={3}
                value={taskGoal}
                onChange={(e) => setTaskGoal(e.target.value)}
              />
            </Field>
          )}

          <Field label="标题（可留空，自动生成）">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </aside>
  );
}
