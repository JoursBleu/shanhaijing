import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white",
  secondary:
    "bg-[var(--color-bg-3)] hover:bg-[var(--color-bg-4)] text-[var(--color-text-1)]",
  ghost:
    "bg-transparent hover:bg-[var(--color-bg-3)] text-[var(--color-text-2)]",
  danger:
    "bg-[var(--color-danger)] hover:opacity-90 text-white",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs rounded",
  md: "h-9 px-3 text-sm rounded-md",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    />
  );
});
