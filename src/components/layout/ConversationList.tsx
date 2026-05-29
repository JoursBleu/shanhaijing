export function ConversationList() {
  return (
    <aside className="w-[240px] shrink-0 bg-[var(--color-bg-1)] border-r border-[var(--color-border)] flex flex-col">
      <header className="h-12 px-3 flex items-center border-b border-[var(--color-border)] font-semibold">
        山海经
      </header>
      <div className="flex-1 overflow-y-auto p-2 text-[var(--color-text-2)] text-sm">
        <div className="px-2 py-1.5 rounded hover:bg-[var(--color-bg-3)] cursor-pointer">
          # 还没有对话
        </div>
      </div>
    </aside>
  );
}
