import { useEffect, useState } from "react";
import { AgentRail } from "@/components/layout/AgentRail";
import { ConversationList } from "@/components/layout/ConversationList";
import { ChatPane } from "@/components/layout/ChatPane";
import { bootstrap } from "@/features/bootstrap";
import { useData } from "@/stores/data";
import { useUI } from "@/stores/ui";

export default function App() {
  const reloadAll = useData((s) => s.reloadAll);
  const personas = useData((s) => s.personas);
  const activePersonaId = useUI((s) => s.activePersonaId);
  const setActivePersonaId = useUI((s) => s.setActivePersonaId);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await bootstrap();
        await reloadAll();
        setReady(true);
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      }
    })();
  }, []);

  // Pick first persona by default
  useEffect(() => {
    if (ready && !activePersonaId && personas.length > 0) {
      setActivePersonaId(personas[0]!.id);
    }
  }, [ready, activePersonaId, personas]);

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
    </div>
  );
}
