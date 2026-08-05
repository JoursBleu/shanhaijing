import { useEffect, useState } from "react";
import { useDialog } from "@/stores/dialog";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

/**
 * Renders the top of the dialog queue as a modal. Mounted once in App.
 */
export function DialogHost() {
  const top = useDialog((s) => s.queue[0]);
  const resolveTop = useDialog((s) => s.resolveTop);
  const [text, setText] = useState("");

  useEffect(() => {
    setText(top?.defaultValue ?? "");
  }, [top?.id]);

  if (!top) return null;

  const isPrompt = top.kind === "prompt";
  const isAlert = top.kind === "alert";

  const cancel = () => resolveTop(isPrompt ? null : false);
  const ok = () => resolveTop(isPrompt ? text : true);

  return (
    <Modal
      open
      title={top.title}
      onClose={cancel}
      footer={
        <>
          {!isAlert && (
            <Button variant="ghost" onClick={cancel}>
              {top.cancelText ?? "取消"}
            </Button>
          )}
          <Button
            variant={top.danger ? "danger" : "primary"}
            onClick={ok}
            autoFocus={!isPrompt}
          >
            {top.confirmText ?? (isAlert ? "知道了" : "确定")}
          </Button>
        </>
      }
    >
      {top.body && (
        <p className="text-sm text-[var(--color-text-2)] whitespace-pre-wrap break-words">
          {top.body}
        </p>
      )}
      {isPrompt && (
        <Input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={top.body ? "mt-3" : ""}
          onKeyDown={(e) => {
            if (e.key === "Enter") ok();
          }}
        />
      )}
    </Modal>
  );
}
