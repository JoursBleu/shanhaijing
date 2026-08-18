import { useEffect, useState } from "react";
import { AgentRail } from "@/components/layout/AgentRail";
import { ConversationList } from "@/components/layout/ConversationList";
import { ChatPane } from "@/components/layout/ChatPane";
import { DialogHost } from "@/components/DialogHost";
import { bootstrap, initializeAfterStartup } from "@/features/bootstrap";
import { useData } from "@/stores/data";
import { useUI } from "@/stores/ui";

export default function App() {
  const reloadAll = useData((s) => s.reloadAll);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await bootstrap();
        await reloadAll();
        setReady(true);
        void initializeAfterStartup()
          .then(async (conversationId) => {
            await Promise.all([
              useData.getState().reloadAgents(),
              useData.getState().reloadConversations(),
            ]);
            useUI.getState().setView({ kind: "conversation", id: conversationId });
          })
          .catch((error) => {
            console.error("Post-startup initialization failed", error);
          });
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      }
    })();
  }, []);

  if (err) {
    return (
      <div className="p-8 text-[var(--color-danger)]">
        启动失败：{err}
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="p-8 text-[var(--color-text-3)]">
        正在打开本地数据库…
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--color-bg-2)] text-[var(--color-text-1)]">
      <AgentRail />
      <ConversationList />
      <ChatPane />
      <DialogHost />
    </div>
  );
}
