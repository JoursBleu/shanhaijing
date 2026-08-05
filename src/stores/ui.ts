import { create } from "zustand";
import type { ID } from "@/types/domain";

type ViewKind =
  | { kind: "welcome" }
  | { kind: "conversation"; id: ID }
  | { kind: "settings" }
  | { kind: "agents" }
  | { kind: "skills" }
  | { kind: "memories" }
  | { kind: "mcp" }
  | { kind: "knowledge" }
  | { kind: "compare" }
  | { kind: "translate" }
  | { kind: "backup" };

interface UIState {
  view: ViewKind;
  setView: (v: ViewKind) => void;

  showPromptDebug: boolean;
  togglePromptDebug: () => void;

  streamingMessageId: ID | null;
  setStreamingMessageId: (id: ID | null) => void;

  // group_id -> chosen variant message id
  activeVariant: Record<string, string>;
  setActiveVariant: (groupId: string, messageId: string) => void;

  // folder_id -> collapsed?
  collapsedFolders: Record<string, boolean>;
  toggleFolder: (folderId: string) => void;

  theme: "dark" | "light";
  setTheme: (t: "dark" | "light") => void;

  language: "zh" | "en";
  setLanguage: (l: "zh" | "en") => void;
}

const LS_THEME = "shanhaijing.theme";
const LS_LANG = "shanhaijing.language";

function applyTheme(t: "dark" | "light") {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", t);
  }
}

export const useUI = create<UIState>((set) => ({
  view: { kind: "welcome" },
  setView: (v) => set({ view: v }),

  showPromptDebug: false,
  togglePromptDebug: () =>
    set((s) => ({ showPromptDebug: !s.showPromptDebug })),

  streamingMessageId: null,
  setStreamingMessageId: (id) => set({ streamingMessageId: id }),

  activeVariant: {},
  setActiveVariant: (groupId, messageId) =>
    set((s) => ({ activeVariant: { ...s.activeVariant, [groupId]: messageId } })),

  collapsedFolders: {},
  toggleFolder: (folderId) =>
    set((s) => ({
      collapsedFolders: {
        ...s.collapsedFolders,
        [folderId]: !s.collapsedFolders[folderId],
      },
    })),

  theme: (() => {
    const t =
      typeof localStorage !== "undefined"
        ? (localStorage.getItem(LS_THEME) as "dark" | "light" | null)
        : null;
    const initial = t === "light" ? "light" : "dark";
    applyTheme(initial);
    return initial;
  })(),
  setTheme: (t) => {
    localStorage.setItem(LS_THEME, t);
    applyTheme(t);
    set({ theme: t });
  },

  language: (() => {
    if (typeof localStorage === "undefined") return "zh";
    const l = localStorage.getItem(LS_LANG);
    if (l === "en" || l === "zh") return l;
    if (typeof navigator !== "undefined" && /^en/i.test(navigator.language))
      return "en";
    return "zh";
  })(),
  setLanguage: (l) => {
    localStorage.setItem(LS_LANG, l);
    set({ language: l });
  },
}));
