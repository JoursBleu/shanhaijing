import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef, TextareaHTMLAttributes } from "react";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-md bg-[var(--color-bg-3)] px-2.5 text-sm",
        "text-[var(--color-text-1)] placeholder:text-[var(--color-text-3)]",
        "focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]",
        className,
      )}
      {...rest}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-md bg-[var(--color-bg-3)] px-2.5 py-2 text-sm",
        "text-[var(--color-text-1)] placeholder:text-[var(--color-text-3)]",
        "focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] resize-y",
        className,
      )}
      {...rest}
    />
  );
});
