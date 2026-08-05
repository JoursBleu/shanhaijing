import { useMemo, useState } from "react";
import { confirmModal, promptModal } from "@/stores/dialog";
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
import {
  createFolder,
  deleteFolder,
  renameFolder,
  setConversationFolder,
} from "@/repos/folders";


export function ConversationList() {
  const conversations = useData((s) => s.conversations);
  const agents = useData((s) => s.agents);
  const folders = useData((s) => s.convFolders);
  const reloadConversations = useData((s) => s.reloadConversations);
  const reloadFolders = useData((s) => s.reloadFolders);
  const view = useUI((s) => s.view);
  const setView = useUI((s) => s.setView);
  const collapsedFolders = useUI((s) => s.collapsedFolders);
  const toggleFolder = useUI((s) => s.toggleFolder);

  const [newOpen, setNewOpen] = useState(false);
  const [agentId, setAgentId] = useState("");
  const [title, setTitle] = useState("");
  const [moveMenuFor, setMoveMenuFor] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const grouped = useMemo(() => {
    const byFolder = new Map<string | null, typeof conversations>();
    for (const c of conversations) {
      const k = c.folder_id ?? null;
      if (!byFolder.has(k)) byFolder.set(k, []);
      byFolder.get(k)!.push(c);
    }
    return byFolder;
  }, [conversations]);

  function resetForm() {
    setAgentId("");
    setTitle("");
  }

  const valid = !!agentId;

  async function startNew() {
    if (!valid) return;
    const agentName = agents.find((a) => a.id === agentId)?.name ?? "新对话";
    const id = await createConversation({
      agent_id: agentId,
      title: title || `与 ${agentName} 的对话`,
    });
    await reloadConversations();
    setView({ kind: "conversation", id });
    setNewOpen(false);
    resetForm();
  }

  async function remove(id: string) {
    if (!(await confirmModal({ title: "删除这段对话？", danger: true }))) return;
    await deleteConversation(id);
    await reloadConversations();
    if (view.kind === "conversation" && view.id === id) {
      setView({ kind: "welcome" });
    }
  }

  async function addFolder() {
    const name = await promptModal({ title: "文件夹名字" });
    if (!name) return;
    await createFolder("conversation", name.trim());
    await reloadFolders();
  }

  async function renameF(id: string, curr: string) {
    const name = await promptModal({ title: "重命名文件夹", defaultValue: curr });
    if (!name || name === curr) return;
    await renameFolder(id, name.trim());
    await reloadFolders();
  }

  async function deleteF(id: string) {
    if (!(await confirmModal({ title: "删除该文件夹？", body: "里面的对话会回到根目录。", danger: true }))) return;
    await deleteFolder(id);
    await Promise.all([reloadFolders(), reloadConversations()]);
  }

  async function moveTo(convId: string, folderId: string | null) {
    await setConversationFolder(convId, folderId);
    await reloadConversations();
    setMoveMenuFor(null);
  }

  function ConvRow({ c }: { c: (typeof conversations)[number] }) {
    const isActive = view.kind === "conversation" && view.id === c.id;
    return (
      <div className="relative">
        <div
          onClick={() => setView({ kind: "conversation", id: c.id })}
          className={cn(
            "group px-2 py-1.5 rounded cursor-pointer flex items-center gap-2",
            isActive
              ? "bg-[var(--color-bg-3)] text-[var(--color-text-1)]"
              : "text-[var(--color-text-2)] hover:bg-[var(--color-bg-3)]",
          )}
        >
          <span className="flex-1 truncate">{c.title || "(未命名)"}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMoveMenuFor(moveMenuFor === c.id ? null : c.id);
            }}
            className="opacity-0 group-hover:opacity-100 text-[var(--color-text-3)] hover:text-[var(--color-text-1)] text-xs"
            title="移动 / 删除"
          >
            ⋯
          </button>
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
        {moveMenuFor === c.id && (
          <div
            className="absolute right-1 top-7 z-10 bg-[var(--color-bg-0)] border border-[var(--color-border)] rounded shadow-lg text-xs min-w-[120px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-2 py-1 text-[var(--color-text-3)] border-b border-[var(--color-border)]">
              移动到
            </div>
            <button
              onClick={() => moveTo(c.id, null)}
              className="block w-full text-left px-2 py-1 hover:bg-[var(--color-bg-3)]"
            >
              （根目录）
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                onClick={() => moveTo(c.id, f.id)}
                className="block w-full text-left px-2 py-1 hover:bg-[var(--color-bg-3)]"
              >
                📁 {f.name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <aside className="w-[240px] shrink-0 bg-[var(--color-bg-1)] border-r border-[var(--color-border)] flex flex-col">
      <header className="h-12 px-3 flex items-center justify-between border-b border-[var(--color-border)] font-semibold">
        <span>山海经</span>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSearchOpen(true)}
            title="搜索"
          >
            🔍
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={addFolder}
            title="新建文件夹"
          >
            📁+
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setNewOpen(true)}
            title="新对话"
            disabled={!agents.length}
          >
            +
          </Button>
        </div>
      </header>

      <div
        className="flex-1 overflow-y-auto p-2 text-sm space-y-0.5"
        onClick={() => setMoveMenuFor(null)}
      >
        {conversations.length === 0 && (
          <div className="px-2 py-1.5 text-[var(--color-text-3)]">
            {agents.length === 0
              ? "先在 👥 里建一个 agent"
              : '点上方的 "+" 开始'}
          </div>
        )}

        {folders.map((f) => {
          const list = grouped.get(f.id) ?? [];
          const collapsed = !!collapsedFolders[f.id];
          return (
            <div key={f.id}>
              <div className="group flex items-center gap-1 px-1 py-1 text-[var(--color-text-3)] text-xs uppercase">
                <button
                  onClick={() => toggleFolder(f.id)}
                  className="hover:text-[var(--color-text-1)]"
                >
                  {collapsed ? "▶" : "▼"}
                </button>
                <span className="flex-1 truncate">📁 {f.name}</span>
                <button
                  onClick={() => renameF(f.id, f.name)}
                  className="opacity-0 group-hover:opacity-100 hover:text-[var(--color-text-1)]"
                  title="重命名"
                >
                  ✎
                </button>
                <button
                  onClick={() => deleteF(f.id)}
                  className="opacity-0 group-hover:opacity-100 hover:text-[var(--color-danger)]"
                  title="删除"
                >
                  ×
                </button>
              </div>
              {!collapsed &&
                list.map((c) => <ConvRow key={c.id} c={c} />)}
            </div>
          );
        })}

        {/* Root (no folder) */}
        {(grouped.get(null) ?? []).map((c) => (
          <ConvRow key={c.id} c={c} />
        ))}
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
          <Field label="选一个 agent">
            <div className="space-y-1 max-h-60 overflow-auto border border-[var(--color-border)] rounded p-2">
              {agents.length === 0 ? (
                <div className="text-xs text-[var(--color-text-3)]">
                  还没有 agent，去 👥 里建一个。
                </div>
              ) : (
                agents.map((a) => (
                  <label
                    key={a.id}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="agent-pick"
                      checked={agentId === a.id}
                      onChange={() => setAgentId(a.id)}
                    />
                    <span>{a.name}</span>
                  </label>
                ))
              )}
            </div>
          </Field>

          <Field label="标题（可留空，自动生成）">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </aside>
  );
}

// Lazy import to avoid circular
import { SearchModal } from "@/components/SearchModal";
