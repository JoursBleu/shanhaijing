import { create } from "zustand";
import type { ID } from "@/types/domain";

type ViewKind =
  | { kind: "welcome" }
  | { kind: "conversation"; id: ID }
  | { kind: "settings" }
  | { kind: "personas" }
  | { kind: "agents" }
  | { kind: "cards" }
  | { kind: "skills" }
  | { kind: "memories" };

interface UIState {
  view: ViewKind;
  setView: (v: ViewKind) => void;

  activePersonaId: ID | null;
  setActivePersonaId: (id: ID | null) => void;

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

const LS_PERSONA = "shanhaijing.active-persona";
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

  activePersonaId:
    typeof localStorage !== "undefined"
      ? localStorage.getItem(LS_PERSONA)
      : null,
  setActivePersonaId: (id) => {
    if (id) localStorage.setItem(LS_PERSONA, id);
    else localStorage.removeItem(LS_PERSONA);
    set({ activePersonaId: id });
  },

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
