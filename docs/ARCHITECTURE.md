# Architecture (v1)

```
React UI (Tauri webview)
  src/components/layout/  → 3-pane shell
  src/features/           → domain features
  src/stores/             → Zustand
  src/db/                 → plugin-sql wrap
                |
                | invoke + plugin-sql
                v
Tauri (Rust)
  plugin-sql    SQLite + migrations
  plugin-fs     character card files
  plugin-dialog open / save dialogs
                |
                v
  ~/AppData (Win) / ~/Library (mac) / ~/.local/share (lin)
    shanhaijing.db, character_cards/, skills/, exports/
```

## Prompt assembly order

For each agent turn, the system message is built in this order:

1. **Character card** (if attached) — persona block from V2 spec
2. **Persona text** (agent.persona_text, overrides card if both set)
3. **Skills** — each attached skill's markdown body, joined with `\n\n---\n\n`
4. **User persona** — `{{user}} bio = ...` so the agent knows who you are
5. **Memory retrieval** — top-K relevant memories for this agent
6. **Group context** (group conversations only) — list of other participants,
   their signatures, and the conversation's `task_goal` if any
7. **Greeting** is delivered as the first assistant message in the conversation,
   not in the system prompt

Then the message history is appended (truncated to context window minus
generation budget).

## Group turn semantics

- Every message in a group is visible to every participating agent.
- After a user message, the **initial_responder** (or any agent in the conv if
  unset) is invited to speak first.
- An agent can:
  - Speak (normal message)
  - End its turn silently by emitting `<silent/>` (no message stored)
  - `@`-mention another agent to queue them next
  - In a **work group**, emit `<done/>` to mark the task done, or
    `<waiting/>` to pause until the user replies
- Casual groups stop after `max_total_turns` consecutive non-user turns.
- Work groups stop on `<done/>`, `<waiting/>`, budget exceeded, or
  `max_total_turns` reached.

## Iron law in code

```ts
// src/features/conversations/create.ts (future)
async function createConversation(input: CreateConvInput) {
  if (!input.user_persona_id) {
    throw new Error("user_persona_id is required (principle 2)");
  }
  if (input.kind === "private" && input.agent_ids.length !== 1) {
    throw new Error("private conversations need exactly one agent");
  }
  if (input.kind !== "private" && input.agent_ids.length < 2) {
    throw new Error("group conversations need at least two agents");
  }
}
```
