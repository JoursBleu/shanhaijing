import { create } from "zustand";
import type {
  Agent,
  CharacterCard,
  Conversation,
  Message,
  Provider,
  Skill,
  UserPersona,
} from "@/types/domain";
import { listProviders } from "@/repos/providers";
import { listPersonas } from "@/repos/personas";
import { listAgents } from "@/repos/agents";
import {
  listConversations,
  listConversationAgents,
} from "@/repos/conversations";
import { listMessages } from "@/repos/messages";
import { listCards } from "@/repos/cards";
import { listSkills } from "@/repos/skills";

interface DataState {
  providers: Provider[];
  personas: UserPersona[];
  agents: Agent[];
  conversations: Conversation[];
  cards: CharacterCard[];
  skills: Skill[];
  // by conversation id
  convAgentIds: Record<string, string[]>;
  messagesByConv: Record<string, Message[]>;

  reloadProviders: () => Promise<void>;
  reloadPersonas: () => Promise<void>;
  reloadAgents: () => Promise<void>;
  reloadConversations: () => Promise<void>;
  reloadCards: () => Promise<void>;
  reloadSkills: () => Promise<void>;
  reloadConvAgents: (convId: string) => Promise<void>;
  reloadMessages: (convId: string) => Promise<void>;
  reloadAll: () => Promise<void>;

  appendMessageLocal: (convId: string, m: Message) => void;
  patchMessageLocal: (convId: string, id: string, patch: Partial<Message>) => void;
}

export const useData = create<DataState>((set, get) => ({
  providers: [],
  personas: [],
  agents: [],
  conversations: [],
  cards: [],
  skills: [],
  convAgentIds: {},
  messagesByConv: {},

  reloadProviders: async () => set({ providers: await listProviders() }),
  reloadPersonas: async () => set({ personas: await listPersonas() }),
  reloadAgents: async () => set({ agents: await listAgents() }),
  reloadConversations: async () =>
    set({ conversations: await listConversations() }),
  reloadCards: async () => set({ cards: await listCards() }),
  reloadSkills: async () => set({ skills: await listSkills() }),

  reloadConvAgents: async (convId) => {
    const rows = await listConversationAgents(convId);
    set((s) => ({
      convAgentIds: { ...s.convAgentIds, [convId]: rows.map((r) => r.agent_id) },
    }));
  },
  reloadMessages: async (convId) => {
    const rows = await listMessages(convId);
    set((s) => ({ messagesByConv: { ...s.messagesByConv, [convId]: rows } }));
  },

  reloadAll: async () => {
    await Promise.all([
      get().reloadProviders(),
      get().reloadPersonas(),
      get().reloadAgents(),
      get().reloadConversations(),
      get().reloadCards(),
      get().reloadSkills(),
    ]);
  },

  appendMessageLocal: (convId, m) =>
    set((s) => ({
      messagesByConv: {
        ...s.messagesByConv,
        [convId]: [...(s.messagesByConv[convId] ?? []), m],
      },
    })),
  patchMessageLocal: (convId, id, patch) =>
    set((s) => {
      const list = s.messagesByConv[convId] ?? [];
      return {
        messagesByConv: {
          ...s.messagesByConv,
          [convId]: list.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        },
      };
    }),
}));
