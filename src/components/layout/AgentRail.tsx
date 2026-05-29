import { useUI } from "@/stores/ui";
import { cn } from "@/lib/utils";

interface IconBtnProps {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}

function RailIcon({ active, onClick, label, children }: IconBtnProps) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "size-12 rounded-2xl transition-all flex items-center justify-center text-lg",
        active
          ? "bg-[var(--color-accent)] text-white rounded-xl"
          : "bg-[var(--color-bg-1)] text-[var(--color-text-2)] hover:bg-[var(--color-accent)] hover:text-white hover:rounded-xl",
      )}
    >
      {children}
    </button>
  );
}

export function AgentRail() {
  const view = useUI((s) => s.view);
  const setView = useUI((s) => s.setView);

  return (
    <aside className="w-[72px] shrink-0 bg-[var(--color-bg-0)] border-r border-[var(--color-border)] flex flex-col items-center py-3 gap-2">
      <RailIcon
        active={view.kind === "welcome" || view.kind === "conversation"}
        onClick={() => setView({ kind: "welcome" })}
        label="对话"
      >
        山
      </RailIcon>
      <div className="h-px w-8 bg-[var(--color-divider)] my-1" />
      <RailIcon
        active={view.kind === "agents"}
        onClick={() => setView({ kind: "agents" })}
        label="Agents"
      >
        👥
      </RailIcon>
      <RailIcon
        active={view.kind === "personas"}
        onClick={() => setView({ kind: "personas" })}
        label="我的身份"
      >
        🪪
      </RailIcon>
      <RailIcon
        active={view.kind === "cards"}
        onClick={() => setView({ kind: "cards" })}
        label="角色卡"
      >
        🎴
      </RailIcon>
      <RailIcon
        active={view.kind === "skills"}
        onClick={() => setView({ kind: "skills" })}
        label="技能"
      >
        📜
      </RailIcon>
      <RailIcon
        active={view.kind === "memories"}
        onClick={() => setView({ kind: "memories" })}
        label="记忆"
      >
        🧠
      </RailIcon>
      <div className="flex-1" />
      <RailIcon
        active={view.kind === "settings"}
        onClick={() => setView({ kind: "settings" })}
        label="设置 / Providers"
      >
        ⚙
      </RailIcon>
    </aside>
  );
}
