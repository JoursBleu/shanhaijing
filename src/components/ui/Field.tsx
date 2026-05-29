import { ReactNode } from "react";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-3)] mb-1">
        {label}
      </div>
      {children}
      {hint && (
        <div className="text-xs text-[var(--color-text-3)] mt-1">{hint}</div>
      )}
    </label>
  );
}
