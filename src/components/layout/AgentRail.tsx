export function AgentRail() {
  return (
    <aside className="w-[72px] shrink-0 bg-[var(--color-bg-0)] border-r border-[var(--color-border)] flex flex-col items-center py-3 gap-2">
      <div className="size-12 rounded-2xl bg-[var(--color-accent)] flex items-center justify-center font-bold">
        山
      </div>
      <div className="h-px w-8 bg-[var(--color-divider)] my-1" />
      <div className="size-12 rounded-2xl bg-[var(--color-bg-1)] hover:bg-[var(--color-accent)] transition-colors cursor-pointer flex items-center justify-center text-[var(--color-text-2)]">
        +
      </div>
    </aside>
  );
}
