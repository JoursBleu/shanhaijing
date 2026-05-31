# 山海经 · Shanhaijing

> 本地优先的 LLM 聊天客户端，IM 形态的多 agent 对话。

一个本地优先（local-first）的 LLM 聊天客户端。形态是 IM——可以一对一和 agent 聊天，也可以把多个 agent 拉到一个群里讨论。

**Status: v1.0.1** — see [docs/v1.0.1-onboarding.md](docs/v1.0.1-onboarding.md)
（v1.0 原始发布说明见 [docs/v1.0-release-notes.md](docs/v1.0-release-notes.md)）。

## Principles

1. **Agents talk in the open.** Agent 之间的协作发生在你在场的群里，所有发言可见。
2. **You're always in the room.** 每个 conversation 都包含你。没有"agent 后台沟通"。
3. **Local first.** 数据存在你的机器上。账号/同步是可选项，不是必需。

## v1 范围

- 多 provider（硅基流动 / 火山方舟 / DeepSeek / Ollama / 任意 OpenAI-兼容）
- 多"我"身份（User Persona）
- Agent 自定义（裸 LLM / 加角色卡 / 加 Skill / 加记忆，任意组合）
- SillyTavern V2 PNG 角色卡导入
- Skill（Markdown + frontmatter，可多挂）
- 1v1 / 闲聊群（有上限）/ 工作群（无上限，可设预算与轮数）
- 流式输出、Markdown、代码块、LaTeX
- 消息编辑 / 重生成 / 分支（swipes）
- 文件夹 + 搜索
- 记忆 v1（自动摘要 + 简单向量检索）
- 导出 Markdown / JSON
- 中英双语 + 多主题

## v1 不做

Agent 静默调用 Agent（agent-as-tool）、MCP、知识库 RAG、TTS/STT/图像、账号/云同步/服务端、移动端、应用市场、NSFW 默认。

## 技术栈

- Tauri 2 + React 19 + TypeScript
- Tailwind v4 + shadcn-style 组件
- Zustand 状态、SQLite（tauri-plugin-sql）
- 直连 OpenAI-兼容协议

## 开发

```bash
pnpm install
pnpm tauri dev
```

## License

[PolyForm Noncommercial 1.0.0](./LICENSE) — 个人 / 教育 / 非营利用途自由使用。商业使用请联系作者授权。
