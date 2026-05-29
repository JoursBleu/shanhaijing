import { useEffect, useRef, useState } from "react";
import { useData } from "@/stores/data";
import { useUI } from "@/stores/ui";
import { sendUserMessage } from "@/features/chat";
import {
  deleteMessage,
  insertMessage,
} from "@/repos/messages";
import { MessageBubble } from "@/components/MessageBubble";
import { ProvidersPanel } from "@/components/settings/ProvidersPanel";
import { PersonasPanel } from "@/components/settings/PersonasPanel";
import { AgentsPanel } from "@/components/settings/AgentsPanel";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";

function Welcome() {
  return (
    <div className="flex-1 overflow-y-auto p-6 text-[var(--color-text-2)]">
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-[var(--color-text-1)]">
          山海经 · Shanhaijing
        </h1>
        <p>把 LLM 当朋友，而不是工具。当面说话，你永远在场。</p>
        <ol className="list-decimal list-inside text-sm space-y-1">
          <li>去 ⚙ 设置里给一个 provider 填上 API key，并点 "抓模型"</li>
          <li>去 🪪 我的身份 选定/创建一个 "我"</li>
          <li>去 👥 Agents 建一个好友（选 provider + 模型）</li>
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
  const messages = useData((s) => s.messagesByConv[id] ?? []);
  const convAgentIds = useData((s) => s.convAgentIds[id] ?? []);
  const agents = useData((s) => s.agents);
  const personas = useData((s) => s.personas);
  const reloadMessages = useData((s) => s.reloadMessages);
  const reloadConvAgents = useData((s) => s.reloadConvAgents);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const greetingFiredRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    reloadMessages(id);
    reloadConvAgents(id);
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, messages[messages.length - 1]?.content]);

  // Greeting on empty conv (run once per conv id)
  useEffect(() => {
    if (!conv) return;
    if (messages.length > 0) return;
    if (convAgentIds.length !== 1) return;
    if (greetingFiredRef.current.has(id)) return;
    const agent = agents.find((a) => a.id === convAgentIds[0]);
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
  }, [id, conv?.id, messages.length, convAgentIds.length]);

  if (!conv) return <Welcome />;

  const agent = agents.find((a) => a.id === convAgentIds[0]);
  const persona = personas.find((p) => p.id === conv.user_persona_id);

  async function send() {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);
    try {
      await sendUserMessage({ conversationId: id, content: text });
    } catch (e: any) {
      alert("发送失败：" + (e?.message ?? e));
    } finally {
      setSending(false);
    }
  }

  async function regenerate(messageId: string) {
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    const prevUser = messages
      .slice(0, idx)
      .reverse()
      .find((m) => m.role === "user");
    if (!prevUser) return;
    await deleteMessage(messageId);
    await reloadMessages(id);
    setSending(true);
    try {
      await sendUserMessage({
        conversationId: id,
        content: prevUser.content,
      });
    } catch (e: any) {
      alert("重生成失败：" + (e?.message ?? e));
    } finally {
      setSending(false);
    }
  }

  async function doDelete(messageId: string) {
    if (!confirm("删除这条消息？")) return;
    await deleteMessage(messageId);
    await reloadMessages(id);
  }

  function senderName(m: { role: string; sender_id: string | null }) {
    if (m.role === "user") {
      return personas.find((p) => p.id === m.sender_id)?.name ?? "我";
    }
    return agents.find((a) => a.id === m.sender_id)?.name ?? "(?)";
  }

  return (
    <>
      <header className="h-12 px-4 flex items-center gap-2 border-b border-[var(--color-border)]">
        <div className="size-7 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-xs font-bold">
          {(agent?.name ?? "?").slice(0, 1)}
        </div>
        <div className="text-[var(--color-text-1)] text-sm">
          <span className="font-semibold">{conv.title || "(未命名)"}</span>
          <span className="text-[var(--color-text-3)] ml-2">
            · {agent?.name ?? "?"} · 以 {persona?.name ?? "?"} 身份
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="max-w-3xl mx-auto space-y-1">
          {messages.length === 0 && (
            <div className="text-center text-[var(--color-text-3)] text-sm py-12">
              说点什么开始吧
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              role={m.role}
              name={senderName(m)}
              content={m.content}
              streaming={
                sending &&
                m.role === "assistant" &&
                m.id === messages[messages.length - 1]?.id
              }
              onRegenerate={
                m.role === "assistant" ? () => regenerate(m.id) : undefined
              }
              onDelete={() => doDelete(m.id)}
            />
          ))}
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
          <Button onClick={send} disabled={sending || !input.trim()}>
            {sending ? "…" : "发送"}
          </Button>
        </div>
      </footer>
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
      {view.kind === "personas" && (
        <>
          <header className="h-12 px-4 flex items-center border-b border-[var(--color-border)] font-semibold">
            我的身份
          </header>
          <PanelView>
            <PersonasPanel />
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
      {view.kind === "conversation" && <ConversationView id={view.id} />}
    </section>
  );
}
