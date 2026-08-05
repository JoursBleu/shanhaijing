# Architecture

> Status: the **current** shape is a single Tauri app. The **target** shape is a
> resident core with the desktop app as one surface among several. Both are
> described below, because the gap between them is the current work.

## Current (as of 2026-08-05)

```
React UI (Tauri webview)
  components/layout/    3-pane shell
  components/settings/  Providers · Agents · Skills · Memories
                        Mcp · Knowledge · Compare · Translate · Backup
  stores/               Zustand: data · ui · dialog
                |
                |  direct calls (same process)
                v
Agent core (TypeScript, ~2.2K lines)
  features/agentLoop     multi-round turn: stream → tool_calls → approve → feed back
  features/agentTools    resolves which tools this agent may use
  features/builtinTools  9 tools
  features/wireHistory   replays persisted tool rounds as OpenAI wire format
  features/knowledge     ingest + hybrid retrieval (vector ⊕ lexical, RRF, rerank)
  features/memoryRetrieval
  llm/                   openai · tools · mcp · embeddings · rerank
  lib/                   extractText · lexical · crypto
  repos/                 all SQL
                |
                |  @tauri-apps/plugin-sql   ← single chokepoint, src/db/index.ts
                v
Tauri (Rust, ~70 lines)   plugin-sql (SQLite + 8 migrations) · plugin-fs · plugin-dialog
                v
  ~/AppData (Win) / ~/Library (mac) / ~/.local/share (lin)
    shanhaijing.db, skills/, exports/
```

The core no longer imports the UI. `features/`, `llm/` and `repos/` have zero
references to `@/stores` or `@/components`; a turn receives a `TurnHost`
(`onMessageCreated` / `onMessageUpdated` / `approve`) from whoever runs it.

That decoupling is what makes the target shape reachable without a rewrite.

## Target

The reference points are Hermes (`AIAgent` core shared by CLI / gateway / ACP /
API server) and OpenClaw (resident Gateway + `gateway-protocol` JSON-RPC, local
or remote). Both put the agent in a long-lived process and make every UI a thin
surface over a protocol.

```
  desktop app        CLI          ACP (VS Code/Zed)      channels
       \              |                  |                 /
        \             |                  |                /
         +------------+--------+---------+---------------+
                               |  protocol (JSON-RPC / HTTP)
                               v
                    Resident agent core
                      agent loop · tools · MCP · RAG · memory
                      scheduler (cron) · channel adapters
                               |
                               v
                        SQLite + files
```

What this unlocks that the current shape cannot: work that outlives the window
(cron, long tasks), non-desktop surfaces, and remote operation.

### The open decision

Where the core runs is not yet decided:

| | Rust core | Node/Bun core |
|---|---|---|
| existing ~2.2K lines of capability code | rewritten | moved as-is |
| pdfjs / mammoth / xlsx / MCP SDK | need Rust equivalents | reused |
| installer | stays ~6 MB | ~60–90 MB (runtime bundled) |

The current 6 MB installer is small precisely *because* there is no backend —
everything rides the system webview. For comparison, OpenClaw is TS/Node,
Hermes is Python, and Cherry Studio's AppImage is 82 MB.

### Known porting work, either way

- `src/db/index.ts` — the only file that imports `@tauri-apps/plugin-sql`
- `lib/crypto.ts` — key currently in `localStorage`; must move to an OS keyring
  (this was already outstanding debt, not new)
- `DOMParser` in `lib/extractText.ts` and `features/backup.ts` — needs a shim
  outside a browser
- `features/exportConversation.ts` — triggers a DOM download; that part belongs
  to the UI surface, not the core

## Data model

SQLite, `src/db/migrations/`, 8 migrations. `0007` and `0008` rebuild tables
because SQLite cannot alter CHECK constraints or drop referenced columns.

| migration | contents |
|---|---|
| `0001_init` | providers · models · agents · skills · folders · conversations · messages · memories (plus the group-chat tables since removed) |
| `0002_mcp` | `mcp_servers` |
| `0003_kb` | `knowledge_bases` · `kb_documents` · `kb_chunks` |
| `0004_embedding` | `app_settings` KV + `memories.embedding_json` |
| `0005_assistant` | per-agent capability columns + `agent_knowledge_bases` |
| `0006_rag` | per-KB chunking / search mode / rerank settings |
| `0007_tool_messages` | widen `role` to include `'tool'`; tool-call columns; `hidden` |
| `0008_agent_focus` | drop group chat, character cards, user personas |

## Prompt assembly

Per turn, the system message is built in this order:

1. **Persona** — `agent.persona_text`, or `You are {name}.`
2. **Skills** — each attached skill's markdown, in full
3. **Memory** — top-K retrieved entries, labelled as background not instruction
4. **Tools** — the names available *this turn*, after per-agent filtering
5. **Output style**

`greeting` is stored as the conversation's first assistant message, not in the
system prompt. Message history follows the system message, with persisted tool
rounds spliced in ahead of the assistant turn that produced them.

Skills are injected in full; trigger-based loading (SKILL.md frontmatter) is
not implemented and is the main source of avoidable context cost.

## Turn semantics

One conversation, one agent. A visible turn may span several model rounds:

```
stream → tool_calls? → approve → execute → feed results back → stream again
```

until the model answers without calling tools, or `max_tool_calls` is hit.
If the provider rejects the `tools` parameter, the first round degrades once to
a plain call, so a model without tool support still works.

Both sending and regenerating run this loop — a regenerated answer has the same
tool access as the original.

## Retrieval

Two arms, fused by Reciprocal Rank Fusion, optionally reranked:

- **vector** — cosine over `kb_chunks.embedding_json`
- **lexical** — tf-idf; CJK indexed as character bigrams, latin/digit runs kept
  whole so identifiers like `ERR_2049` survive

RRF is rank-based, so the arms need no score calibration — the reason it is
used instead of a weighted sum of cosine and tf-idf, whose scales are
unrelated. Reranking is best-effort; failure falls back to the fused order.

Vectors are stored as JSON text and scored in-process. That is fine for small
bases and is the first thing to break at scale.
