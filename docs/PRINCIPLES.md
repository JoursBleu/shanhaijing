# Principles

These principles override convenience, performance, and feature requests.
When in doubt, re-read this file.

> **2026-08-05 rewrite.** The previous principles 1 and 2 ("agents talk in the
> open", "you're always in the room") were statements about multi-agent group
> chat. Group chat was moved off the main line to the `v1-multi-agent` branch,
> so those two no longer describe this product. The old text is preserved on
> that branch.

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

## 3. A turn is started by a human

The agent acts inside a turn the user initiated. There is no cron, no
background task, no wake-on-event.

This is the principle most likely to change: an agent host in the
Hermes/OpenClaw sense is defined by outliving the window. When it does change,
it changes deliberately, with the audit trail from principle 1 intact — not as
a side effect of adding a scheduler.

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
