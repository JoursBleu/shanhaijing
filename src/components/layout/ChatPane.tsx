export function ChatPane() {
  return (
    <section className="flex-1 flex flex-col bg-[var(--color-bg-2)]">
      <header className="h-12 px-4 flex items-center border-b border-[var(--color-border)] text-[var(--color-text-1)]">
        欢迎
      </header>

      <div className="flex-1 overflow-y-auto p-6 text-[var(--color-text-2)]">
        <div className="max-w-2xl mx-auto space-y-4">
          <h1 className="text-2xl font-bold text-[var(--color-text-1)]">
            山海经 · Shanhaijing
          </h1>
          <p>把 LLM 当朋友，而不是工具。当面说话，你永远在场。</p>
          <ul className="list-disc list-inside text-sm space-y-1">
            <li>所有 agent 当面说话</li>
            <li>你永远在群里</li>
            <li>数据全部在本地</li>
          </ul>
          <p className="text-[var(--color-text-3)] text-xs">
            v0.1 · 正在搭骨架，欢迎在 GitHub 关注进展。
          </p>
        </div>
      </div>

      <footer className="border-t border-[var(--color-border)] p-3">
        <div className="rounded-lg bg-[var(--color-bg-3)] px-3 py-2 text-[var(--color-text-3)]">
          输入框（待接通 provider 后启用）
        </div>
      </footer>
    </section>
  );
}
