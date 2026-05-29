import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { useUI } from "@/stores/ui";
import { searchMessages, type SearchHit } from "@/repos/messages";
import { useData } from "@/stores/data";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SearchModal({ open, onClose }: Props) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const setView = useUI((s) => s.setView);
  const conversations = useData((s) => s.conversations);

  async function run(query: string) {
    setQ(query);
    if (!query.trim()) {
      setHits([]);
      return;
    }
    setBusy(true);
    try {
      const rows = await searchMessages(query.trim(), { limit: 50 });
      setHits(rows);
    } finally {
      setBusy(false);
    }
  }

  function open_(convId: string) {
    setView({ kind: "conversation", id: convId });
    onClose();
  }

  function snippet(content: string, query: string, around = 30): string {
    if (!query) return content.slice(0, 80);
    const i = content.toLowerCase().indexOf(query.toLowerCase());
    if (i < 0) return content.slice(0, 80);
    const start = Math.max(0, i - around);
    const end = Math.min(content.length, i + query.length + around);
    return (
      (start > 0 ? "…" : "") +
      content.slice(start, end).replace(/\s+/g, " ") +
      (end < content.length ? "…" : "")
    );
  }

  return (
    <Modal open={open} title="搜索消息" onClose={onClose}>
      <div className="space-y-3">
        <Input
          autoFocus
          value={q}
          onChange={(e) => run(e.target.value)}
          placeholder="输入关键词…"
        />
        {busy && <div className="text-xs text-[var(--color-text-3)]">搜索中…</div>}
        <div className="max-h-96 overflow-auto space-y-1">
          {hits.map((h) => {
            const conv = conversations.find((c) => c.id === h.conversation_id);
            return (
              <button
                key={h.message_id}
                onClick={() => open_(h.conversation_id)}
                className="block w-full text-left px-2 py-1.5 rounded hover:bg-[var(--color-bg-3)]"
              >
                <div className="text-xs text-[var(--color-text-3)]">
                  {conv?.title || h.conversation_title || "(未命名)"} · {h.role}
                </div>
                <div className="text-sm truncate">{snippet(h.content, q)}</div>
              </button>
            );
          })}
          {!busy && q && hits.length === 0 && (
            <div className="text-sm text-[var(--color-text-3)]">没有结果</div>
          )}
        </div>
      </div>
    </Modal>
  );
}
