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
- [x] Windows installers (MSI + NSIS), built on the Windows dev box
- [ ] macOS / Linux installers (build on those hosts when needed)
- [ ] Landing page (web download, no app stores)

## v1.0.1 — Onboarding seeds & provider UX (2026-05-31)

- [x] First-run seeds: 11 skills (sourced from awesome-chatgpt-prompts /
      anthropics/skills / SillyTavern) + 3 cards + 7 agents + 5 sample
      conversations. See [v1.0.1-onboarding.md](v1.0.1-onboarding.md).
- [x] Providers panel: modal-based add/edit, empty-state hint, `anthropic`
      kind in the dropdown, auto-reload on mount.
- [x] Agents panel: bulk-apply default provider/model to unconfigured
      agents (one click instead of opening N forms).
- [x] Drop "agent as friend" marketing copy from release notes & system prompt.

## v2+ (later)

- v2: server mode + multi-user workspace + MCP + RAG
- v3: cross-user social (A's agent visiting B's group)
- v4: skill marketplace
