# Roadmap

## Where this is going

Toward an **agent host** in the Hermes / OpenClaw sense: a resident core that
several surfaces talk to. The ordering rule is *reach parity with what already
works before adding anything new* — which is why the pivot was a subtractive
refactor rather than a rewrite.

## Shipped

### v1.0 → v1.0.1 (2026-05-31)

Multi-provider chat, agents, skills, memory (lexical retrieval), variant
branches, folders, full-text search, export, i18n, themes, first-run seeds.
Windows MSI + NSIS.

### v1.1 (2026-08-05) — agent layer

- Agent loop: multi-round tool calling with approval, degrading to a plain
  stream when the provider rejects `tools`
- 9 built-in tools; MCP client over Streamable HTTP
- Per-agent capability surface: `tool_mode` / `mcp_mode` / `max_tool_calls` /
  tool whitelist / knowledge-base bindings
- Knowledge base RAG: hybrid retrieval (vector ⊕ lexical, RRF) + optional
  cross-encoder rerank; per-KB chunking and search settings
- Document parsing: PDF, DOCX, XLSX, PPTX, EPUB, HTML, CSV/TSV
- Structured tool history — the model can see what it already looked up after a
  reload
- Embedding-based memory retrieval with lexical fallback
- Workspaces: multi-model compare, translation, WebDAV backup
- Linux deb/rpm/AppImage + Windows msi/nsis

### Main-line pivot (2026-08-05)

Group chat, character cards and user personas removed from `main`; the full
implementation lives on `v1-multi-agent` (tag `v1.1.0`). The agent core was
decoupled from the UI via `TurnHost` injection.

## Next

### Decide where the core runs

Rust vs Node/Bun. Blocks everything below it, because it determines whether the
existing ~2.2K lines of capability code move or get rewritten, and it changes
the installer by roughly 10×. See ARCHITECTURE.md § The open decision.

### Execution

The highest-value missing capability, and the one that separates this from a
chat client. The plumbing is small — the agent loop, tool registry, approval
flow and per-agent gating already exist; it needs a `run_command` tool and a
Tauri shell permission.

The work is the sandbox, not the plumbing. Hermes ships six terminal backends
(local / docker / ssh / modal / daytona / singularity) and OpenHands isolates
in Docker for the same reason: an LLM driving a shell, steered by text it
retrieved, is an arbitrary-code-execution path. First version should target an
isolated backend (WSL / container / remote host), not the user's own shell.

### Extract the resident core

Move the core out of the webview, put a protocol in front of it, make the
desktop app one surface. Then cron, non-desktop surfaces and remote operation
become possible.

Porting checklist in ARCHITECTURE.md § Known porting work.

## Backlog

| item | note |
|---|---|
| stdio MCP | needs a Tauri sidecar; only Streamable HTTP works today, and much of the MCP ecosystem is stdio |
| API keys → OS keyring | currently AES-GCM with the key in `localStorage`; also blocks the core extraction |
| vector index | `embedding_json` + in-process cosine breaks down past small bases |
| trigger-based skill loading | SKILL.md frontmatter; today every attached skill is injected in full |
| auto-update channel | tauri-updater |
| auto-extract memory at session end | still a manual button |
| MCP marketplace | server URLs are typed by hand |
| expose an OpenAI-compatible endpoint | would let other clients use this as a provider |
| code splitting | main bundle ~984 KB |

## Not planned

- Multi-agent group chat — lives on `v1-multi-agent`, not coming back to main
- Character cards / roleplay — same
- Cross-user social, skill marketplace — the v3/v4 ideas from the old roadmap,
  dropped with the pivot
