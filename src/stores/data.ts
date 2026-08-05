import { create } from "zustand";
import type {
  Agent,
  Conversation,
  Folder,
  Message,
  Provider,
  Skill,
} from "@/types/domain";
import { listProviders } from "@/repos/providers";
import { listAgents } from "@/repos/agents";
import { listConversations } from "@/repos/conversations";
import { listMessages } from "@/repos/messages";
import { listSkills } from "@/repos/skills";
import { listFolders } from "@/repos/folders";

interface DataState {
  providers: Provider[];
  agents: Agent[];
  conversations: Conversation[];
  skills: Skill[];
  convFolders: Folder[];
  messagesByConv: Record<string, Message[]>;

  reloadProviders: () => Promise<void>;
  reloadAgents: () => Promise<void>;
  reloadConversations: () => Promise<void>;
  reloadSkills: () => Promise<void>;
  reloadFolders: () => Promise<void>;
  reloadMessages: (convId: string) => Promise<void>;
  reloadAll: () => Promise<void>;

  appendMessageLocal: (convId: string, m: Message) => void;
  patchMessageLocal: (convId: string, id: string, patch: Partial<Message>) => void;
}

/** Optimistic row for the streaming UI, before the DB row is read back. */
export function localMessage(
  m: Pick<Message, "id" | "conversation_id" | "role" | "content"> &
    Partial<Message>,
): Message {
  return {
    sender_id: null,
    parent_id: null,
    active_branch_id: null,
    variant_group_id: null,
    variant_index: 0,
    turn_id: null,
    in_reply_to_message_id: null,
    tokens_in: null,
    tokens_out: null,
    cost_cents: null,
    tool_calls_json: null,
    tool_call_id: null,
    tool_name: null,
    hidden: false,
    created_at: new Date().toISOString(),
    ...m,
  };
}

export const useData = create<DataState>((set, get) => ({
  providers: [],
  agents: [],
  conversations: [],
  skills: [],
  convFolders: [],
  messagesByConv: {},

  reloadProviders: async () => set({ providers: await listProviders() }),
  reloadAgents: async () => set({ agents: await listAgents() }),
  reloadConversations: async () =>
    set({ conversations: await listConversations() }),
  reloadSkills: async () => set({ skills: await listSkills() }),
  reloadFolders: async () => set({ convFolders: await listFolders("conversation") }),

  reloadMessages: async (convId) => {
    const rows = await listMessages(convId);
    set((s) => ({ messagesByConv: { ...s.messagesByConv, [convId]: rows } }));
  },

  reloadAll: async () => {
    await Promise.all([
      get().reloadProviders(),
      get().reloadAgents(),
      get().reloadConversations(),
      get().reloadSkills(),
      get().reloadFolders(),
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
