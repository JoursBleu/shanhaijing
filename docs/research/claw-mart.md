# 调研：Claw Mart / SOUL.md 生态 vs 山海经

> 日期：2026-05-31
> 起因：收到 Claw Mart Daily Issue #4 "Give your agent a personality that actually works"，
>       讲 `SOUL.md` 写法。顺手把它背后的 marketplace、SOUL.md 事实标准、以及和山海经
>       现有 design 的关系一并理清。
> 结论先放最前：**不抄、不接、不导入**。山海经 v1 现有的 character_card + persona_text +
>     skills 三层模型已经覆盖了 Claw Mart 的全部抽象，而且做得更结构化。Claw Mart
>     只有一件事山海经将来可以考虑借鉴：**skill 的 frontmatter 字段约定**。

---

## 1. Claw Mart 是什么

- 站点：[shopclawmart.com](https://www.shopclawmart.com/)
- 公开 API：`GET /api/public/listings`（返回全部在售 listing，json）
- 定位：**OpenClaw / Claude Code agent 生态的 marketplace**，卖三种东西：
  1. **Persona**（SOUL.md 文件）——"角色卡 + 文风指南"，售价中位偏高（$29–$149）
  2. **Skill**（SKILL.md 文件）——单一任务流水线，售价较低（$5–$19）
  3. **Bundle**——上面两种打包
- 创作者抽成 90%；公开宣称累计 paid out `$100k+`
- "Start Selling" 入口 = 卖 SOUL.md / SKILL.md / Bundle

### 1.1 实际交易数据（截 2026-05-30 爬取）

| 指标 | 数字 | 来源 |
|---|---|---|
| 在售 listings | 1,785 | `/api/public/listings` |
| 总创作者 | 138 | sitemap |
| 累计销售单数 | **6,341** | 138 个 creator page `Total sales` 求和 |
| 累计评价数 | 102（评价率 5.7%） | 同上 |
| 标价总和（库存量） | $1,156,468 | 不是 GMV |

**销售极度头部集中**：
- 138 个创作者里 **72 个零销售**（52%）
- Top 2（Felix Craft 3141 单 + Brian Wagner 1134 单）= **67% 总销量**
- Felix Craft 一个人 = **49.5%**，几乎可以确定是 founding creator / 平台自营标杆

**与 6,341 单 × 中位 $15 ≈ $95k GMV 对照官网"$100k paid out"**，数字真实，但
真实买家活跃度不高，是典型 marketplace 冷启动困境。

---

## 2. SOUL.md 是什么

不是 Claw Mart 自创，是 OpenClaw / Claude Code 生态的事实约定，主要项目：

| 仓库 | 角色 | ⭐ |
|---|---|---|
| `aaronjmars/soul.md` | 事实标准模板 + builder agent | 534 |
| `thedaviddias/souls-directory` | 公共注册表 | 124 |
| `mergisi/awesome-openclaw-agents` | 162 个 SOUL.md 模板汇总 | 3485 |
| `BeardedChop/soul-templates` | 8 个开箱即用人格 | 6 |
| `shazhou-ww/souls-cli` | `souls.directory` 的 CLI | 0 |
| `totalmarkdown/soul.md` | 自称 "Open standard for AI agent personality" | 1 |
| `Lustrum258/Hedera-agent-Local-AI-Personality-Engine` | 中文项目，SOUL.md 绑定 session | 2 |

### 2.1 SOUL.md 的字段结构（aaronjmars 模板）

纯 Markdown，章节固定：

```
# [Name]
One-line summary

## Who I Am               ← 背景
## Worldview              ← 基本世界观（"具体到可能被反驳"）
## Opinions               ← 按 domain 分的具体立场
   ### [Domain 1]
   ### [Domain 2]
## Interests              ← 兴趣
## Current Focus          ← 当前在做什么（定期更新）
## Influences             ← 谁/什么书影响了我
   ### People
   ### Books/Works
   ### Concepts/Frameworks
## Vocabulary             ← 我用的术语 + 我绝不用的词
## Tensions & Contradictions  ← 自相矛盾的地方
## Boundaries             ← Won't / Will express uncertainty on
## Pet Peeves             ← 我厌恶的东西
```

配套 `STYLE.template.md`：voice principles / sentence structure / tone /
vocabulary（常用 + 不用）/ punctuation / emojis / formatting / platform differences。

**核心命题**（原作者原话）：

> "Not a chatbot that talks about you — an AI that thinks and speaks **as you**.
>  Someone reading your SOUL.md should be able to predict your takes on new topics.
>  If they can't, it's too vague."

### 2.2 SOUL.md vs SKILL.md（同一个 Claw Mart 的两种 listing）

| | persona / SOUL.md | skill / SKILL.md |
|---|---|---|
| 数量 | 564 | 1,197 |
| 中位价 | $29–$149 | $5–$19 |
| 命名规律 | 都是人名（Felix / Teagan / Luca / Aria） | 都是动名词系统（Engine / Audit / Loops / Fortress） |
| 回答的问题 | **谁、怎么想、怎么说话** | **怎么完成任务 X** |
| 类比 | 角色卡 | LangChain tool / Cursor rule pack |

---

## 3. SOUL.md vs SillyTavern RP 角色卡

形似，但**目的相反**：

| | SOUL.md | SillyTavern V2 / Tavern card |
|---|---|---|
| 目的 | agent **代表用户去做事** | AI **陪用户演戏** |
| 主角 | AI 是代理人，面向外部世界（GitHub / 邮箱 / 客户） | AI 是对手戏演员，只面对一个用户 |
| 成功标准 | 外部世界看不出是 AI 干的，且做得对 | 用户觉得对方像活人/像那个角色 |
| 立场 | 鼓励具体立场（"Most people optimize for status, not truth"） | 回避真实政治/价值观，限定在虚构剧情内 |
| anti-pattern 方向 | 禁 sycophancy、禁 hedging、禁 "Great question!" → **少演** | jailbreak prompt 反复"你不是 AI 不要 OOC" → **多演** |
| 决策 | 有 Decision philosophy（80% 把握就动手 / 何时 escalate） | 没有 |
| 长期记忆 | 给 agent 攒外部知识（客户列表、PRD 模板） | lorebook 维护剧情设定 |
| 格式 | 纯 Markdown，多文件分层（SOUL + STYLE + USER） | JSON 或 PNG EXIF，单文件 + lorebook |
| 工具调用 | 有（OpenClaw / Claude Code） | 一般没有 |
| 互动模式 | 多轮工具调用 + 1 次最终汇报，对话只是 UI | 纯对话循环 |

**重叠点**：

- 都靠**具体性**打败 LLM 的中位人格
- 都强调声音 / 词汇 / 标点
- 都用 anti-pattern（负面约束）锁定行为
- 都受首段 prompt 锚定效应影响

---

## 4. 山海经现有 design 对照

山海经的 `agents` 表 + prompt 拼装顺序（见 ARCHITECTURE.md）**已经把 Claw Mart 的
全部抽象都拆开了，而且做得更细**。

### 4.1 字段层 1:1 对照

| 概念 | 山海经（`agents` / 相关表） | Claw Mart | SillyTavern RP |
|---|---|---|---|
| 是谁（虚构身份） | `character_cards.parsed_json`（V2 PNG 导入） | persona listing | character card |
| 怎么想 / 怎么说 | `agents.persona_text`（可覆盖 card） | SOUL.md | description + personality |
| 怎么干活 | `agent_skills`（多挂、`position` 可排序） | SKILL.md listings | ❌ 没有 |
| 开场白 | `agents.greeting` | ❌ | `first_mes` |
| 群里身份签名 | `agents.signature` | ❌ | ❌（山海经独有，多 agent 群聊需要） |
| 长期记忆 | `agents.memory_enabled` + `memories` 表 | 外挂（Aeon 等） | lorebook |
| 用户视角 | `user_personas`（`bio`）+ 每个 conversation `NOT NULL` | ❌ | `{{user}}` |
| 工作边界 | `conversations.cost_limit_cents` / `task_goal` / `<done/>` / `<waiting/>` | 文档里"Boundaries"章 | ❌ |

### 4.2 SOUL.md 4 大主题 → 山海经的落点

那篇 newsletter 强调的 4 件事，**山海经已经把它们落到 schema**：

| SOUL.md 主题 | 山海经落点 |
|---|---|
| Voice & Tone | `agents.persona_text` / 导入的 character_card 里的 personality 段 |
| Anti-patterns | 同上（写在 persona_text 里），prompt debug 面板可见 |
| Decision philosophy | 群里 `<silent/>` / `<done/>` / `<waiting/>` 控制 token + `initial_responder` 调度 |
| Boundaries | `conversations.cost_limit_cents` / `max_total_turns` / `max_per_agent_turns` / `task_status` |

### 4.3 山海经多出来的、Claw Mart / SillyTavern 都没的

- **三种 persona 来源解耦**：character_card（外部 PNG，只读）vs persona_text
  （自己写，可覆盖）vs skills（独立 + 多挂 + 可排序）。Claw Mart 把这 3 件
  事都叫 "listing"，没区分。
- **群聊语义是一等公民**：`signature` / 群聊调度 token / casual vs work group
- **work group 当任务跑**：`task_goal` / `cost_limit_cents` / `task_status`，
  这正是 SOUL.md 文章里讲的 "decision philosophy + boundaries" 落到 schema
- **Principle 1 反对 agent-as-tool**：和 Claw Mart / OpenClaw 整个生态相反。
  那边 agent 在后台调 sub-agent / skill / MCP 是默认形态；山海经把"agent 跟
  agent 协作"硬拉回到**用户在场的群聊**里。

---

## 5. 山海经从 Claw Mart / SOUL.md 生态可借鉴的东西

### 5.1 值得考虑借鉴

**a. SKILL.md 的 frontmatter 字段约定**

现在山海经的 `skills` 表有 `metadata_json` 字段但没规定结构。可以参考 Claw Mart /
OpenClaw 生态形成的事实约定（categories、compatibility、required_tools），
未来若做 skill 导入/导出，frontmatter 可以这样：

```yaml
---
name: Three-Tier Memory System
category: productivity
tagline: Persistent structured memory that actually scales
required_tools: [filesystem, sqlite]
compatible_with: [openclaw, claude, gpt, cursor, shanhaijing]
version: 1.0.0
---
（markdown body）
```

但**不需要现在就做**——v1 没有导入/导出/分享 skill 的需求。

**b. SOUL.md 模板里的 "Tensions & Contradictions" 段**

这个段落 SillyTavern 角色卡传统里没有，但对避免"圆润正确"的 agent 很有用。
未来 persona_text 编辑器可以给个**推荐填写章节模板**，把这一条加进去。

### 5.2 明确不抄

- **不引入 SOUL.md 作为新的一等文件类型**：persona_text 已经够用，多一个文件
  类型只会让 UX 复杂化
- **不做 marketplace**：违反 Principle 3（Local first）且违反 PolyForm NC license
- **不做 agent-as-tool 来兼容 OpenClaw skill**：违反 Principle 1
- **不导入 .souls 注册表**：用户想要的话自己复制粘贴 SOUL.md 文件正文进
  persona_text 字段即可，无需专门 importer

---

## 6. 一句话总结

- **Claw Mart**：OpenClaw 生态的 marketplace，卖 SOUL.md（角色卡 + 文风）和 SKILL.md
  （职业技能）。138 创作者 / 6.3k 销售单 / Top 2 占 67%，典型冷启动 marketplace。
- **SOUL.md**：事实标准的"职业角色卡"，重点是 *who* 不是 *how*；和 SillyTavern RP 卡
  骨架一样、肌肉相反。
- **山海经**：本地优先的 IM 客户端 + 多 agent 群聊 host，已用 `character_cards` +
  `persona_text` + `skills` + 群聊调度 token 4 层把 SOUL.md / SKILL.md / RP 卡
  的能力全覆盖。**不抄、不接、不导入**；将来若做 skill 分享，可参考 OpenClaw
  生态的 frontmatter 约定。
