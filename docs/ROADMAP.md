# Roadmap

## The goal

Reach feature parity with the agent apps we benchmarked — OpenClaw, Hermes,
Cherry Studio, OpenHands, Cline — then differentiate. Principles are deferred
until this checklist is largely closed (see PRINCIPLES.md).

## Settled: the core stays TypeScript

Parity itself decides this. Rewriting the existing ~2.2K lines of capability
code in Rust would *lose* features on day one — pdfjs, mammoth, xlsx and the
MCP SDK have no equivalent Rust implementations, and OpenClaw is TS/Node
anyway. Installer size is not a feature.

So: the core moves from the webview into a Node/Bun process as-is. The
installer goes from ~6 MB to ~60–90 MB, which is normal here (Cherry's AppImage
is 82 MB; ours is small only because there is no backend).

## Parity checklist

### Have

Agent loop with multi-round tool calling · tool approval · per-agent capability
surface · MCP over Streamable HTTP · knowledge base RAG (hybrid + rerank) ·
document parsing (PDF/DOCX/XLSX/PPTX/EPUB/HTML/CSV) · embedding memory ·
multi-provider · variant branches · folders · export · multi-model compare ·
translation · WebDAV backup

### Missing — no daemon required

| capability | who has it | note |
|---|---|---|
| **execution / terminal backends** | Hermes (6: local/docker/ssh/modal/daytona/singularity), OpenClaw (elevated bash), OpenHands (Docker), Cline | biggest single gap; plumbing is small, the sandbox is the work |
| **file read/write tools** | all | |
| **browser tools** | Hermes (5 backends) | |
| **sub-agent delegation** | Hermes (`delegate_tool`, parallel) | |
| **stdio MCP** | all | needs a Tauri sidecar; most of the ecosystem is stdio |
| **slash command system** | OpenClaw (`/config /mcp /plugins /bash`) | |
| **plan/act mode** | Cline | |
| **trigger-based skill loading** | Hermes, OpenHands (microagent) | today every attached skill is injected in full |
| **self-improving skills / auto-curated memory** | Hermes (`/learn` loop) | memory = facts, skill = procedure |
| **FTS5 cross-session recall** | Hermes | we have LIKE search only |
| **credential pool rotation** | Hermes | |
| **vision / image input** | Hermes, Cherry | |
| **MCP marketplace** | Cherry | server URLs are typed by hand today |
| **expose an OpenAI-compatible endpoint** | Cherry v2, OpenClaw, Hermes | lets other clients use us as a provider |
| **voice mode** | Hermes, OpenClaw | |

### Missing — requires the resident core

| capability | who has it |
|---|---|
| **resident core + protocol** | OpenClaw (`gateway-protocol` JSON-RPC), Hermes (`AIAgent` shared by every surface) |
| **cron / scheduling** | Hermes (60s tick, natural-language schedules), OpenClaw |
| **channel adapters** | OpenClaw (25+ platforms), Hermes (20+) |
| **ACP (VS Code / Zed / JetBrains)** | Hermes |
| **CLI surface** | both |
| **profiles / multi-instance isolation** | Hermes |
| **hooks** | Hermes |
| **health doctor / setup wizard** | OpenClaw |
| **plugin system** | OpenClaw (Plugin SDK), Hermes (3 sources) |

## Order of work

1. **Execution** — the most conspicuous gap, and independent of everything
   else. Ships as a tool with a pluggable backend so the sandbox choice stays
   data rather than a rewrite. Even with principles deferred, the first backend
   should not be the user's own shell: retrieved text steering a shell is an
   RCE path, which is a correctness problem rather than a philosophical one.
2. **The rest of the no-daemon column** — files, browser, sub-agents, stdio
   MCP, slash commands, trigger-based skills, FTS5.
3. **Extract the resident core** — out of the webview, protocol in front,
   desktop app becomes one surface. The whole daemon column unlocks together.
4. **Channels, cron, ACP, CLI** — all downstream of 3.

## Not planned

Multi-agent group chat and character cards live on `v1-multi-agent` and are not
coming back to main. Cross-user social and the skill marketplace (the old v3/v4
items) were dropped with the pivot.

## Shipped

- **v1.0 → v1.0.1** (2026-05-31) — multi-provider chat, agents, skills, memory,
  variant branches, folders, search, export, i18n, themes, first-run seeds
- **v1.1** (2026-08-05) — the agent layer: tool calling, MCP, knowledge base
  RAG, document parsing, structured tool history, three workspaces
- **main pivot** (2026-08-05) — group chat / cards / personas out; core
  decoupled from the UI via `TurnHost`
