import { create } from "zustand";
import type { ID } from "@/types/domain";

interface UIState {
  activeConversationId: ID | null;
  setActiveConversation: (id: ID | null) => void;
  showPromptDebug: boolean;
  togglePromptDebug: () => void;
}

export const useUI = create<UIState>((set) => ({
  activeConversationId: null,
  setActiveConversation: (id) => set({ activeConversationId: id }),
  showPromptDebug: false,
  togglePromptDebug: () => set((s) => ({ showPromptDebug: !s.showPromptDebug })),
}));
