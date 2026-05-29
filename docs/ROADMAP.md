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

- [x] Edit / regenerate / branches (swipes)
- [x] Folders for agents & conversations
- [x] Full-text search over messages

## v0.6 — Memory

- [x] Manual + auto memory entries (fact / summary / preference)
- [x] One-click "sediment to memory" per conversation (LLM-driven JSON extraction)
- [x] Naive lexical retrieval (top-K) injected into system prompt
- [ ] Embedding-based retrieval (deferred to v1.1)

## v0.7 — Polish

- [x] Bilingual i18n (zh + en)
- [x] Themes (dark default + light)
- [x] Export Markdown / JSON
- [x] Prompt debug panel
- [ ] Auto-update channel (deferred to post-1.0)

## v1.0 — First public release

- [x] Bug bash (typecheck + vite build clean across all features)
- [x] Release notes ([v1.0-release-notes.md](v1.0-release-notes.md))
- [ ] Windows / macOS / Linux installers (run `pnpm tauri build` per host)
- [ ] Landing page (web download, no app stores)

## v2+ (later)

- v2: server mode + multi-user workspace + MCP + RAG
- v3: cross-user social (A's agent visiting B's group)
- v4: skill marketplace
