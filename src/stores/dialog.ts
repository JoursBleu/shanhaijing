import { create } from "zustand";

/**
 * In-app dialog queue (replaces window.confirm / alert / prompt).
 *
 * Tauri 2 rewrites the browser globals to call the `dialog` plugin, which then
 * fails with "Command plugin:dialog|confirm not allowed by ACL". We render our
 * own modal instead — nicer UX and no ACL dependency.
 *
 * Use the imperative helpers (confirmModal/alertModal/promptModal) from anywhere,
 * including non-React code (features/*).
 */

export type DialogKind = "confirm" | "alert" | "prompt";

export interface DialogRequest {
  id: string;
  kind: DialogKind;
  title: string;
  body?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  resolve: (value: boolean | string | null) => void;
}

interface DialogState {
  queue: DialogRequest[];
  enqueue: (req: Omit<DialogRequest, "id">) => void;
  resolveTop: (value: boolean | string | null) => void;
}

let seq = 0;

export const useDialog = create<DialogState>((set, get) => ({
  queue: [],
  enqueue: (req) =>
    set((s) => ({ queue: [...s.queue, { ...req, id: `dlg-${++seq}` }] })),
  resolveTop: (value) => {
    const [top, ...rest] = get().queue;
    if (top) {
      top.resolve(value);
      set({ queue: rest });
    }
  },
}));

export function confirmModal(opts: {
  title: string;
  body?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    useDialog.getState().enqueue({
      kind: "confirm",
      resolve: (v) => resolve(v === true),
      ...opts,
    });
  });
}

export function alertModal(opts: {
  title: string;
  body?: string;
}): Promise<void> {
  return new Promise((resolve) => {
    useDialog.getState().enqueue({
      kind: "alert",
      resolve: () => resolve(),
      ...opts,
    });
  });
}

export function promptModal(opts: {
  title: string;
  body?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    useDialog.getState().enqueue({
      kind: "prompt",
      resolve: (v) => resolve(typeof v === "string" ? v : null),
      ...opts,
    });
  });
}
