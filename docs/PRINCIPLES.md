# Principles

These principles override convenience, performance, and feature requests.
When in doubt, re-read this file.

## 1. Agents talk in the open

All inter-agent communication happens inside conversations the user is part of,
as plain visible messages — same surface as the user's own messages.

There are no "silent" agent-to-agent calls. There is no "backstage" where
agents whisper to each other before producing an answer.

### Why

- The user is the social anchor. Hide the conversation and the agents become
  black boxes again.
- Debugging multi-agent systems requires seeing every message in order.
- Trust degrades fast when behavior is invisible.

### Implication for v1

There is no agent-as-tool / sub-agent invocation. An agent that needs another
agent's help `@`-mentions them in the current group; the user sees it; the
other agent responds in the group.

### Future

If, after launch, user demand is overwhelming or the industry standardizes on
agent-as-tool, we may reconsider. When we do, "silent calls" must remain
inspectable (expandable in the UI) and opt-in.

## 2. You're always in the room

Every conversation has exactly one `user_persona_id`. A conversation cannot
exist without a user identity. Group chats include the user as a participant,
not as a spectator.

The schema enforces this at the DB level (NOT NULL) and the API enforces it at
the code level (`create_conversation` requires a persona).

## 3. Local first

User data lives on the user's machine. The default install requires no
account, no server, no telemetry.

Cloud sync and shared workspaces are optional features added later, and they
must work the same way the local app works — never as a replacement.

## 4. Don't preset what you can't legally serve

The bundled provider list is curated to providers that are operable inside
mainland China without VPN (硅基流动, 火山方舟, DeepSeek, Ollama, plus
"custom OpenAI-compatible"). Users can always add anything they want.

We do not preset OpenAI / Anthropic / Google directly. We do not bundle a
proxy. We do not ship a way to bypass network restrictions.
