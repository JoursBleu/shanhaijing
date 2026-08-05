# Principles

> **2026-08-05 status: deferred.** Feature parity with OpenClaw / Hermes comes
> first. These are recorded so the eventual trade-offs are deliberate rather
> than accidental — they are *not* currently gating work. Principle 3 in
> particular is expected to be broken on purpose (a resident core outliving the
> window is the whole point of the parity target).
>
> Revisit once the parity checklist in ROADMAP.md is largely closed.

## 1. The user sees what the agent did

An agent may call tools, search, and read files, but every one of those actions
is recorded and rendered in the transcript. There is no hidden work.

Concretely: tool rounds are persisted (`role='tool'`, keyed by `turn_id`) and
replayed on reload, and the visible message carries an inline trace of each
call. If a turn's behaviour cannot be reconstructed from the transcript, that
is a bug.

### Why

An agent that can act is only trustworthy if its actions are auditable. The
moment "it did something, we're not sure what" becomes acceptable, no amount of
capability is worth shipping.

## 2. Capability is granted, not assumed

Tools, MCP servers, and knowledge bases are per-agent configuration. A new
agent gets nothing it was not given.

This is why `agents` carries `tool_mode`, `mcp_mode`, `max_tool_calls` and an
optional whitelist, and why knowledge bases are bound through
`agent_knowledge_bases`. An agent with no knowledge base bound is not handed
`search_knowledge` at all — it cannot search what it was never given.

### Implication as execution lands

When the agent can run commands, the default execution target must be isolated
(container / remote host), not the user's own shell. Prompt injection through a
retrieved document is a realistic path to arbitrary code execution, and the
blast radius has to be bounded by construction rather than by the model's good
behaviour.

## 3. A turn is started by a human ~~(deferred)~~

Historically: the agent acts inside a turn the user initiated — no cron, no
background task, no wake-on-event.

**Explicitly dropped as a constraint.** cron, channels and a resident core are
parity requirements, and all three break this. What should survive the break is
principle 1: whatever the agent does unattended still has to be reconstructable
from the record afterwards.

## 4. Local first

User data lives on the user's machine. The default install requires no account,
no server, no telemetry.

A resident backend does **not** dilute this: it runs on the user's own machine.
"Local first" is about where data and control live, not about whether there is
a long-running process.

Cloud sync and shared workspaces, if built, are optional additions that work
the same way the local app works — never a replacement.

## 5. Don't preset what you can't legally serve

The bundled provider list is curated to providers operable inside mainland
China without a VPN (硅基流动, 火山方舟, DeepSeek, Ollama, plus "custom
OpenAI-compatible"). Users can always add anything they want.

We do not preset OpenAI / Anthropic / Google directly. We do not bundle a
proxy. We do not ship a way to bypass network restrictions.
