import { useUI } from "@/stores/ui";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

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
  const theme = useUI((s) => s.theme);
  const setTheme = useUI((s) => s.setTheme);
  const language = useUI((s) => s.language);
  const setLanguage = useUI((s) => s.setLanguage);
  const t = useT();

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
        label={t("Agents")}
      >
        👥
      </RailIcon>
      <RailIcon
        active={view.kind === "skills"}
        onClick={() => setView({ kind: "skills" })}
        label={t("技能")}
      >
        📜
      </RailIcon>
      <RailIcon
        active={view.kind === "memories"}
        onClick={() => setView({ kind: "memories" })}
        label={t("记忆")}
      >
        🧠
      </RailIcon>
      <RailIcon
        active={view.kind === "mcp"}
        onClick={() => setView({ kind: "mcp" })}
        label="MCP"
      >
        🔌
      </RailIcon>
      <RailIcon
        active={view.kind === "knowledge"}
        onClick={() => setView({ kind: "knowledge" })}
        label="知识库"
      >
        📚
      </RailIcon>
      <RailIcon
        active={view.kind === "compare"}
        onClick={() => setView({ kind: "compare" })}
        label="多模型同问"
      >
        ⚖️
      </RailIcon>
      <RailIcon
        active={view.kind === "translate"}
        onClick={() => setView({ kind: "translate" })}
        label="AI 翻译"
      >
        🌐
      </RailIcon>
      <RailIcon
        active={view.kind === "backup"}
        onClick={() => setView({ kind: "backup" })}
        label="备份与恢复"
      >
        ☁️
      </RailIcon>
      <div className="flex-1" />
      <RailIcon
        active={false}
        onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
        label={language === "zh" ? "Switch to English" : "切到中文"}
      >
        {language === "zh" ? "EN" : "中"}
      </RailIcon>
      <RailIcon
        active={false}
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        label={theme === "dark" ? t("切到浅色") : t("切到深色")}
      >
        {theme === "dark" ? "☀" : "🌙"}
      </RailIcon>
      <RailIcon
        active={view.kind === "settings"}
        onClick={() => setView({ kind: "settings" })}
        label={t("设置 / Providers")}
      >
        ⚙
      </RailIcon>
    </aside>
  );
}
