import { ReactNode, useEffect } from "react";

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        className="bg-[var(--color-bg-1)] border border-[var(--color-border)] rounded-lg w-[min(560px,92vw)] max-h-[88vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-[var(--color-border)] font-semibold flex items-center justify-between">
          {title}
          <button
            onClick={onClose}
            className="text-[var(--color-text-3)] hover:text-[var(--color-text-1)] text-xl leading-none"
          >
            ×
          </button>
        </header>
        <div className="p-4 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <footer className="px-4 py-3 border-t border-[var(--color-border)] flex justify-end gap-2">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
