import { AgentRail } from "@/components/layout/AgentRail";
import { ConversationList } from "@/components/layout/ConversationList";
import { ChatPane } from "@/components/layout/ChatPane";

export default function App() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--color-bg-2)] text-[var(--color-text-1)]">
      <AgentRail />
      <ConversationList />
      <ChatPane />
    </div>
  );
}
