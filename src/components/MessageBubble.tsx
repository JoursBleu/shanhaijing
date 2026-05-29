import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";

interface Props {
  role: "user" | "assistant" | "system";
  name: string;
  avatar?: string | null;
  content: string;
  streaming?: boolean;
  onSaveEdit?: (newContent: string) => void | Promise<void>;
  onRegenerate?: () => void;
  onDelete?: () => void;
  // Variant navigation (optional)
  variantIndex?: number;
  variantTotal?: number;
  onPrevVariant?: () => void;
  onNextVariant?: () => void;
}

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue}, 60%, 45%)`;
}

export function MessageBubble({
  role,
  name,
  content,
  streaming,
  onSaveEdit,
  onRegenerate,
  onDelete,
  variantIndex,
  variantTotal,
  onPrevVariant,
  onNextVariant,
}: Props) {
  const isUser = role === "user";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);

  useEffect(() => {
    if (!editing) setDraft(content);
  }, [content, editing]);

  async function commit() {
    if (!onSaveEdit) return;
    await onSaveEdit(draft);
    setEditing(false);
  }

  return (
    <div className="group flex gap-3 px-2 py-2 hover:bg-[var(--color-bg-3)]/40 rounded">
      <div
        className="size-9 rounded-full shrink-0 flex items-center justify-center text-sm font-bold text-white"
        style={{ background: avatarColor(name || (isUser ? "我" : "A")) }}
      >
        {(name || (isUser ? "我" : "A")).slice(0, 1)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-[var(--color-text-1)]">
            {name}
          </span>
          {streaming && (
            <span className="text-xs text-[var(--color-text-3)]">…</span>
          )}
          {variantTotal && variantTotal > 1 && (
            <span className="text-xs text-[var(--color-text-3)] flex items-center gap-1 ml-1">
              <button
                onClick={onPrevVariant}
                disabled={!onPrevVariant || (variantIndex ?? 0) <= 0}
                className="hover:text-[var(--color-text-1)] disabled:opacity-30"
              >
                ‹
              </button>
              <span>
                {((variantIndex ?? 0) + 1)}/{variantTotal}
              </span>
              <button
                onClick={onNextVariant}
                disabled={
                  !onNextVariant ||
                  (variantIndex ?? 0) >= (variantTotal - 1)
                }
                className="hover:text-[var(--color-text-1)] disabled:opacity-30"
              >
                ›
              </button>
            </span>
          )}
        </div>

        {editing ? (
          <div className="mt-1 space-y-2">
            <Textarea
              autoFocus
              rows={Math.min(20, Math.max(3, draft.split("\n").length + 1))}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditing(false);
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") commit();
              }}
              className="font-mono text-xs"
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                取消
              </Button>
              <Button size="sm" onClick={commit}>
                保存（⌘/Ctrl+Enter）
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "prose prose-invert prose-sm max-w-none",
              "[&_pre]:bg-[var(--color-bg-0)] [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:overflow-x-auto",
              "[&_code]:bg-[var(--color-bg-0)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs",
              "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[13px]",
              "[&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5",
              "[&_a]:text-[var(--color-accent)]",
              "text-[var(--color-text-1)] whitespace-pre-wrap",
            )}
          >
            {content ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex, rehypeHighlight]}
              >
                {content}
              </ReactMarkdown>
            ) : (
              <span className="text-[var(--color-text-3)] italic">…</span>
            )}
          </div>
        )}

        {!editing && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 mt-1 text-xs text-[var(--color-text-3)]">
            <button
              onClick={() => navigator.clipboard.writeText(content)}
              className="hover:text-[var(--color-text-1)]"
            >
              复制
            </button>
            {onSaveEdit && (
              <button
                onClick={() => setEditing(true)}
                className="hover:text-[var(--color-text-1)]"
              >
                编辑
              </button>
            )}
            {onRegenerate && !isUser && (
              <button
                onClick={onRegenerate}
                className="hover:text-[var(--color-text-1)]"
              >
                重生成
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="hover:text-[var(--color-danger)]"
              >
                删除
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
