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

/** Whether an agent may call built-in tools. */
export type ToolMode = "disabled" | "auto";
/** `manual` exposes only the MCP tools named in `enabled_tools_json`. */
export type McpMode = "disabled" | "auto" | "manual";

export interface Agent {
  id: ID;
  name: string;
  avatar_path: string | null;
  default_provider_id: ID | null;
  default_model: string | null;
  default_temperature: number;
  default_max_tokens: number | null;
  default_top_p: number;
  persona_text: string | null;
  greeting: string | null;
  memory_enabled: boolean;
  folder_id: ID | null;
  tool_mode: ToolMode;
  mcp_mode: McpMode;
  max_tool_calls: number;
  /** JSON string[] whitelist of tool names; null = every tool of an enabled kind. */
  enabled_tools_json: string | null;
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

export interface Conversation {
  id: ID;
  title: string;
  /** Null once the agent is deleted; the transcript outlives it. */
  agent_id: ID | null;
  folder_id: ID | null;

  /** Per-conversation overrides of the agent's defaults. */
  provider_id: ID | null;
  model: string | null;
  temperature: number | null;
  max_tokens: number | null;
  top_p: number | null;

  cost_used_cents: number;

  created_at: string;
  updated_at: string;
}

export type MessageRole = "user" | "assistant" | "system" | "tool";

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
  turn_id: ID | null;
  in_reply_to_message_id: ID | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_cents: number | null;
  /** Assistant turns that invoked tools: JSON of the wire-format tool_calls. */
  tool_calls_json: string | null;
  /** Tool-result rows: the call they answer. */
  tool_call_id: ID | null;
  tool_name: string | null;
  /** Tool plumbing rows are replayed to the model but not rendered in the UI. */
  hidden: boolean;
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
  embedding_json?: string | null;
  importance: number;
  created_at: string;
}
