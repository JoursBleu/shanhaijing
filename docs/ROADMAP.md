# Roadmap

## v0.1 — Skeleton (now)

- [x] Tauri 2 + React 19 + TS + Tailwind v4
- [x] Three-pane shell (rail / list / chat)
- [x] SQLite schema (migration 0001)
- [x] PolyForm NC license
- [ ] CI: typecheck + cargo check

## v0.2 — Talk to one agent

- [ ] Provider CRUD UI + encrypted key storage
- [ ] Model list fetch + cache
- [ ] User Persona CRUD (single persona OK)
- [ ] Agent CRUD (bare LLM, no card/skill yet)
- [ ] Private (1v1) conversation: send → stream → render
- [ ] Markdown + code highlighting

## v0.3 — Characters & skills

- [ ] SillyTavern V2 PNG import
- [ ] Skill CRUD (markdown + frontmatter)
- [ ] Attach card / skills to agent
- [ ] Greeting playback on new conversation
- [ ] Prompt debug panel

## v0.4 — Groups

- [ ] Casual group: pick agents, capped turns
- [ ] Work group: task_goal, cost/turn limits, `<done/>` / `<waiting/>`
- [ ] `@`-mention turn queueing
- [ ] `<silent/>` opt-out

## v0.5 — History power tools

- [ ] Edit / regenerate / branches (swipes)
- [ ] Folders for agents & conversations
- [ ] Full-text search over messages

## v0.6 — Memory

- [ ] Auto-summary at conversation end
- [ ] Simple local embedding (sentence-transformers via ONNX or remote)
- [ ] Retrieval-augmented prompt injection

## v0.7 — Polish

- [ ] Bilingual i18n (zh + en)
- [ ] Themes (Discord dark default, plus a light theme + 1 alt)
- [ ] Export Markdown / JSON
- [ ] Auto-update channel

## v1.0 — First public release

- [ ] Windows / macOS / Linux installers
- [ ] Landing page (web download, no app stores)
- [ ] Bug bash

## v2+ (later)

- v2: server mode + multi-user workspace + MCP + RAG
- v3: cross-user social (A's agent visiting B's group)
- v4: skill marketplace
