import { useEffect, useRef, useState } from "react";
import { confirmModal, alertModal } from "@/stores/dialog";
import { useData } from "@/stores/data";
import { useUI } from "@/stores/ui";
import {
  sendUserMessage,
  regenerateAssistantMessage,
  type TurnHost,
} from "@/features/chat";
import { summarizeConversation } from "@/features/summarize";
import {
  exportConversationAsMarkdown,
  exportConversationAsJson,
} from "@/features/exportConversation";
import { buildPromptDebug } from "@/features/promptDebug";
import {
  deleteMessage,
  insertMessage,
  updateMessageContent,
} from "@/repos/messages";
import { groupByVariant, pickActiveVariants } from "@/lib/variants";
import { MessageBubble } from "@/components/MessageBubble";
import { ProvidersPanel } from "@/components/settings/ProvidersPanel";
import { AgentsPanel } from "@/components/settings/AgentsPanel";
import { SkillsPanel } from "@/components/settings/SkillsPanel";
import { MemoriesPanel } from "@/components/settings/MemoriesPanel";
import { McpPanel } from "@/components/settings/McpPanel";
import { KnowledgePanel } from "@/components/settings/KnowledgePanel";
import { ExecPanel } from "@/components/settings/ExecPanel";
import { ComparePanel } from "@/components/settings/ComparePanel";
import { TranslatePanel } from "@/components/settings/TranslatePanel";
import { BackupPanel } from "@/components/settings/BackupPanel";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

// Stable empty reference: returning a fresh `[]` from a Zustand selector makes
// useSyncExternalStore see a new snapshot every render → infinite loop (React #185).
const EMPTY: never[] = [];

function Welcome() {
  return (
    <div className="flex-1 overflow-y-auto p-6 text-[var(--color-text-2)]">
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-[var(--color-text-1)]">
          山海经 · Shanhaijing
        </h1>
        <p>本地优先的 agent 客户端：多 provider、工具调用、MCP、知识库。</p>
        <ol className="list-decimal list-inside text-sm space-y-1">
          <li>去 ⚙ 设置里给一个 provider 填上 API key，并点 "抓模型"</li>
          <li>去 🪪 我的身份 选定/创建一个 "我"</li>
          <li>去 👥 Agents 建一个 agent（选 provider + 模型）</li>
          <li>在左侧 "+" 开一段对话</li>
        </ol>
      </div>
    </div>
  );
}

function PanelView({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6">{children}</div>
    </div>
  );
}

function ConversationView({ id }: { id: string }) {
  const conv = useData((s) => s.conversations.find((c) => c.id === id));
  const messages = useData((s) => s.messagesByConv[id] ?? EMPTY);
  const agents = useData((s) => s.agents);
  const reloadMessages = useData((s) => s.reloadMessages);
  const activeVariant = useUI((s) => s.activeVariant);
  const setActiveVariant = useUI((s) => s.setActiveVariant);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [promptDebug, setPromptDebug] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const greetingFiredRef = useRef<Set<string>>(new Set());
  const turnAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    reloadMessages(id);
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, messages[messages.length - 1]?.content]);

  // Greeting on empty conv (run once per conv id)
  useEffect(() => {
    if (!conv) return;
    if (messages.length > 0) return;
    if (greetingFiredRef.current.has(id)) return;
    const agent = agents.find((a) => a.id === conv.agent_id);
    if (!agent || !agent.greeting) return;
    greetingFiredRef.current.add(id);
    (async () => {
      await insertMessage({
        conversation_id: id,
        role: "assistant",
        sender_id: agent.id,
        content: agent.greeting!,
      });
      await reloadMessages(id);
    })();
  }, [id, conv?.id, conv?.agent_id, messages.length]);

  if (!conv) return <Welcome />;

  const agent = agents.find((a) => a.id === conv.agent_id);

  const turnHost: TurnHost = {
    onMessageCreated: (m) => useData.getState().appendMessageLocal(id, m),
    onMessageUpdated: (mid, content) =>
      useData.getState().patchMessageLocal(id, mid, { content }),
    approve: async ({ name, args, agentName }) => {
      let a = "";
      try {
        a = JSON.stringify(args);
      } catch {
        a = String(args);
      }
      return confirmModal({
        title: `允许 ${agentName} 调用工具「${name}」？`,
        body: `参数：${a}`,
        confirmText: "允许",
        cancelText: "拒绝",
      });
    },
  };

  async function send() {
    if (!input.trim() || sending) return;
    const text = input.trim();
    const controller = new AbortController();
    turnAbortRef.current = controller;
    setInput("");
    setSending(true);
    try {
      await sendUserMessage({
        ...turnHost,
        conversationId: id,
        content: text,
        signal: controller.signal,
        activeVariants: activeVariant,
      });
    } catch (e: any) {
      void alertModal({ title: "发送失败", body: String(e?.message ?? e) });
    } finally {
      turnAbortRef.current = null;
      setSending(false);
    }
  }

  async function regenerate(messageId: string) {
    const controller = new AbortController();
    turnAbortRef.current = controller;
    setSending(true);
    try {
      const newId = await regenerateAssistantMessage({
        ...turnHost,
        conversationId: id,
        assistantMessageId: messageId,
        signal: controller.signal,
        activeVariants: activeVariant,
      });
      // Find the group id for this message and set new variant as active.
      const fresh = useData.getState().messagesByConv[id] ?? [];
      const m = fresh.find((x) => x.id === messageId);
      const gid = m?.variant_group_id ?? messageId;
      setActiveVariant(gid, newId);
      await reloadMessages(id);
    } catch (e: any) {
      void alertModal({ title: "重生成失败", body: String(e?.message ?? e) });
    } finally {
      turnAbortRef.current = null;
      setSending(false);
    }
  }

  async function doDelete(messageId: string) {
    if (!(await confirmModal({ title: "删除这条消息？", danger: true }))) return;
    await deleteMessage(messageId);
    await reloadMessages(id);
  }

  function senderName(m: { role: string; sender_id: string | null }) {
    if (m.role === "user") return "我";
    return agents.find((a) => a.id === m.sender_id)?.name ?? agent?.name ?? "(?)";
  }

  return (
    <>
      <header className="h-12 px-4 flex items-center gap-2 border-b border-[var(--color-border)]">
        <div className="size-7 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-xs font-bold">
          {(agent?.name ?? "?").slice(0, 1)}
        </div>
        <div className="text-[var(--color-text-1)] text-sm flex-1 min-w-0">
          <span className="font-semibold">{conv.title || "(未命名)"}</span>
          <span className="text-[var(--color-text-3)] ml-2">
            · {agent?.name ?? "(agent 已删除)"}
          </span>
        </div>
        <button
          className="text-xs text-[var(--color-text-3)] hover:text-[var(--color-text-1)] disabled:opacity-30"
          disabled={summarizing || messages.length === 0}
          title="把这次对话沉淀为 agent 的记忆条目"
          onClick={async () => {
            setSummarizing(true);
            try {
              const res = await summarizeConversation(id);
              const total = res.reduce(
                (a, r) => a + (r.summaryMemoryId ? 1 : 0) + r.factMemoryIds.length + r.preferenceMemoryIds.length,
                0,
              );
              void alertModal({ title: `已写入 ${total} 条记忆。` });
            } catch (e: any) {
              void alertModal({ title: "总结失败", body: String(e?.message ?? e) });
            } finally {
              setSummarizing(false);
            }
          }}
        >
          {summarizing ? "总结中…" : "💾 沉淀为记忆"}
        </button>
        <button
          className="text-xs text-[var(--color-text-3)] hover:text-[var(--color-text-1)]"
          title="导出为 Markdown"
          onClick={() => exportConversationAsMarkdown(id, { activeVariants: activeVariant })}
        >
          ⇩MD
        </button>
        <button
          className="text-xs text-[var(--color-text-3)] hover:text-[var(--color-text-1)]"
          title="导出为 JSON"
          onClick={() => exportConversationAsJson(id)}
        >
          ⇩JSON
        </button>
        <button
          className="text-xs text-[var(--color-text-3)] hover:text-[var(--color-text-1)]"
          title="查看本次会话下一个回合将注入的 system prompt"
          onClick={async () => {
            try {
              const debug = await buildPromptDebug(id);
              setPromptDebug(debug);
            } catch (e: any) {
              void alertModal({ title: "调试失败", body: String(e?.message ?? e) });
            }
          }}
        >
          🔍prompt
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="max-w-3xl mx-auto space-y-1">
          {messages.length === 0 && (
            <div className="text-center text-[var(--color-text-3)] text-sm py-12">
              说点什么开始吧
            </div>
          )}
          {(() => {
            const visible = pickActiveVariants(messages, activeVariant);
            const groups = groupByVariant(messages);
            return visible.map((m) => {
              const gid = m.variant_group_id ?? m.id;
              const siblings = (groups.get(gid) ?? []).slice().sort(
                (a, b) => a.variant_index - b.variant_index,
              );
              const total = siblings.length;
              const idx = siblings.findIndex((s) => s.id === m.id);
              return (
                <MessageBubble
                  key={m.id}
                  role={m.role}
                  name={senderName(m)}
                  content={m.content}
                  streaming={
                    sending &&
                    m.role === "assistant" &&
                    m.id === visible[visible.length - 1]?.id
                  }
                  onSaveEdit={async (newContent) => {
                    await updateMessageContent(m.id, newContent);
                    await reloadMessages(id);
                  }}
                  onRegenerate={
                    m.role === "assistant" ? () => regenerate(m.id) : undefined
                  }
                  onDelete={() => doDelete(m.id)}
                  variantIndex={total > 1 ? idx : undefined}
                  variantTotal={total > 1 ? total : undefined}
                  onPrevVariant={
                    total > 1 && idx > 0
                      ? () => setActiveVariant(gid, siblings[idx - 1]!.id)
                      : undefined
                  }
                  onNextVariant={
                    total > 1 && idx < total - 1
                      ? () => setActiveVariant(gid, siblings[idx + 1]!.id)
                      : undefined
                  }
                />
              );
            });
          })()}
          <div ref={bottomRef} />
        </div>
      </div>

      <footer className="border-t border-[var(--color-border)] p-3">
        <div className="max-w-3xl mx-auto flex items-end gap-2">
          <Textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={`和 ${agent?.name ?? "..."} 说点什么…（Enter 发送，Shift+Enter 换行）`}
            disabled={sending}
          />
          <Button
            onClick={sending ? () => turnAbortRef.current?.abort() : send}
            disabled={!sending && !input.trim()}
            variant={sending ? "secondary" : "primary"}
          >
            {sending ? "停止" : "发送"}
          </Button>
        </div>
      </footer>
      {promptDebug !== null && (
        <Modal open={true} onClose={() => setPromptDebug(null)} title="System Prompt (下一回合)">
          <div className="space-y-2">
            <div className="text-xs text-[var(--color-text-3)]">
              这是下一次发消息时模型会看到的 system 段。Markdown 渲染前的原文。
            </div>
            <pre className="text-xs bg-[var(--color-bg-0)] text-[var(--color-text-1)] p-3 rounded overflow-auto max-h-[60vh] whitespace-pre-wrap">
              {promptDebug}
            </pre>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => navigator.clipboard.writeText(promptDebug)}
              >
                复制
              </Button>
              <Button size="sm" onClick={() => setPromptDebug(null)}>
                关闭
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

export function ChatPane() {
  const view = useUI((s) => s.view);

  return (
    <section className="flex-1 flex flex-col bg-[var(--color-bg-2)] min-w-0">
      {view.kind === "welcome" && (
        <>
          <header className="h-12 px-4 flex items-center border-b border-[var(--color-border)] font-semibold">
            欢迎
          </header>
          <Welcome />
        </>
      )}
      {view.kind === "settings" && (
        <>
          <header className="h-12 px-4 flex items-center border-b border-[var(--color-border)] font-semibold">
            Providers / 设置
          </header>
          <PanelView>
            <ProvidersPanel />
          </PanelView>
        </>
      )}
      {view.kind === "agents" && (
        <>
          <header className="h-12 px-4 flex items-center border-b border-[var(--color-border)] font-semibold">
            Agents
          </header>
          <PanelView>
            <AgentsPanel />
          </PanelView>
        </>
      )}
      {view.kind === "skills" && (
        <>
          <header className="h-12 px-4 flex items-center border-b border-[var(--color-border)] font-semibold">
            技能
          </header>
          <PanelView>
            <SkillsPanel />
          </PanelView>
        </>
      )}
      {view.kind === "memories" && (
        <>
          <header className="h-12 px-4 flex items-center border-b border-[var(--color-border)] font-semibold">
            记忆
          </header>
          <PanelView>
            <MemoriesPanel />
          </PanelView>
        </>
      )}
      {view.kind === "mcp" && (
        <>
          <header className="h-12 px-4 flex items-center border-b border-[var(--color-border)] font-semibold">
            MCP
          </header>
          <PanelView>
            <McpPanel />
          </PanelView>
        </>
      )}
      {view.kind === "knowledge" && (
        <>
          <header className="h-12 px-4 flex items-center border-b border-[var(--color-border)] font-semibold">
            知识库
          </header>
          <PanelView>
            <KnowledgePanel />
          </PanelView>
        </>
      )}
      {view.kind === "exec" && (
        <>
          <header className="h-12 px-4 flex items-center border-b border-[var(--color-border)] font-semibold">
            执行环境
          </header>
          <PanelView>
            <ExecPanel />
          </PanelView>
        </>
      )}
      {view.kind === "compare" && (
        <>
          <header className="h-12 px-4 flex items-center border-b border-[var(--color-border)] font-semibold">
            多模型同问
          </header>
          <PanelView>
            <ComparePanel />
          </PanelView>
        </>
      )}
      {view.kind === "translate" && (
        <>
          <header className="h-12 px-4 flex items-center border-b border-[var(--color-border)] font-semibold">
            AI 翻译
          </header>
          <PanelView>
            <TranslatePanel />
          </PanelView>
        </>
      )}
      {view.kind === "backup" && (
        <>
          <header className="h-12 px-4 flex items-center border-b border-[var(--color-border)] font-semibold">
            备份与恢复
          </header>
          <PanelView>
            <BackupPanel />
          </PanelView>
        </>
      )}
      {view.kind === "conversation" && <ConversationView id={view.id} />}
    </section>
  );
}
