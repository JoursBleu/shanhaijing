/**
 * Domain types — single source of truth for v1 schema.
 * Mirrors the SQL migrations under src/db/migrations/.
 */

export type ID = string; // ulid

export interface Provider {
  id: ID;
  name: string;
  base_url: string;
  api_key_encrypted: string | null;
  kind: "openai" | "anthropic" | "ollama" | "custom";
  enabled: boolean;
  created_at: string;
}

export interface Model {
  id: ID;
  provider_id: ID;
  name: string;
  context_length: number | null;
  supports_vision: boolean;
  cached_at: string;
}

export interface UserPersona {
  id: ID;
  name: string;
  avatar_path: string | null;
  bio: string;
  created_at: string;
}

export interface Agent {
  id: ID;
  name: string;
  avatar_path: string | null;
  signature: string;
  default_provider_id: ID | null;
  default_model: string | null;
  default_temperature: number;
  default_max_tokens: number | null;
  default_top_p: number;
  card_id: ID | null;
  persona_text: string | null;
  greeting: string | null;
  memory_enabled: boolean;
  folder_id: ID | null;
  created_at: string;
}

export interface CharacterCard {
  id: ID;
  name: string;
  raw_file_path: string;
  parsed_json: string;
  created_at: string;
}

export interface Skill {
  id: ID;
  name: string;
  description: string;
  body_markdown: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

export interface AgentSkill {
  agent_id: ID;
  skill_id: ID;
  position: number;
}

export type FolderKind = "agent" | "conversation";

export interface Folder {
  id: ID;
  kind: FolderKind;
  name: string;
  parent_id: ID | null;
  position: number;
}

export type ConversationKind = "private" | "casual" | "work";
export type TaskStatus = "open" | "done" | "abandoned";

export interface Conversation {
  id: ID;
  kind: ConversationKind;
  title: string;
  user_persona_id: ID;
  folder_id: ID | null;

  task_goal: string | null;
  task_status: TaskStatus | null;
  task_summary: string | null;
  cost_limit_cents: number | null;
  cost_used_cents: number;
  initial_responder: ID | null;
  max_total_turns: number | null;
  max_per_agent_turns: number | null;

  created_at: string;
  updated_at: string;
}

export interface ConversationAgent {
  conversation_id: ID;
  agent_id: ID;
  provider_id: ID | null;
  model: string | null;
  temperature: number | null;
  max_tokens: number | null;
  top_p: number | null;
}

export type MessageRole = "user" | "assistant" | "system";

export interface Message {
  id: ID;
  conversation_id: ID;
  role: MessageRole;
  sender_id: ID | null;
  parent_id: ID | null;
  active_branch_id: ID | null;
  variant_group_id: ID | null;
  variant_index: number;
  content: string;
  mentioned_agent_ids: string;
  turn_id: ID | null;
  in_reply_to_message_id: ID | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_cents: number | null;
  created_at: string;
}

export type MemoryKind = "fact" | "summary" | "preference";

export interface Memory {
  id: ID;
  agent_id: ID;
  conversation_id: ID | null;
  kind: MemoryKind;
  content: string;
  embedding: Uint8Array | null;
  importance: number;
  created_at: string;
}
