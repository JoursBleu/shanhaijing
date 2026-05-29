import { useState } from "react";
import { useData } from "@/stores/data";
import { useUI } from "@/stores/ui";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import {
  createConversation,
  deleteConversation,
} from "@/repos/conversations";

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
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [title, setTitle] = useState("");

  const personaOk = !!activePersonaId && !!personas.find((p) => p.id === activePersonaId);

  async function startNew() {
    if (!activePersonaId || !selectedAgentId) return;
    const agent = agents.find((a) => a.id === selectedAgentId);
    const id = await createConversation({
      kind: "private",
      title: title || (agent ? `与 ${agent.name} 的对话` : "新对话"),
      user_persona_id: activePersonaId,
      agent_ids: [selectedAgentId],
    });
    await reloadConversations();
    await reloadConvAgents(id);
    setView({ kind: "conversation", id });
    setNewOpen(false);
    setSelectedAgentId("");
    setTitle("");
  }

  async function remove(id: string) {
    if (!confirm("删除这段对话？")) return;
    await deleteConversation(id);
    await reloadConversations();
    if (view.kind === "conversation" && view.id === id) {
      setView({ kind: "welcome" });
    }
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
        onClose={() => setNewOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>
              取消
            </Button>
            <Button
              onClick={startNew}
              disabled={!personaOk || !selectedAgentId}
            >
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
          <Field label="选一个 agent">
            <select
              className="h-9 w-full rounded-md bg-[var(--color-bg-3)] px-2.5 text-sm"
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
            >
              <option value="">（选 agent）</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="标题（可留空，自动生成）">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </aside>
  );
}
