/**
 * First-run seeds for skills / character cards / agents / conversations.
 *
 * Each section only seeds if its own table is empty, so users who delete
 * a sample never get it back uninvited, and existing data is never touched.
 *
 * Agents are seeded with no provider/model set; the user picks a provider
 * the first time they open one. Conversations are seeded only when there
 * is at least one user persona to own them.
 */

import { getDb } from "@/db";
import { createSkill, setAgentSkills, listSkills } from "@/repos/skills";
import { createCard, listCards } from "@/repos/cards";
import { createAgent, listAgents } from "@/repos/agents";
import {
  createConversation,
  listConversations,
} from "@/repos/conversations";
import { listPersonas } from "@/repos/personas";

// ---------------- Skills ----------------

const SEED_SKILLS = [
  {
    slug: "translator",
    name: "翻译官",
    description: "中英互译，保留语气与术语",
    body_markdown: `# 翻译官 (Translator)

你的任务是在中文与英文之间互译用户提供的文本。

## 规则
- 自动判断源语言：中文→英文，英文→中文。
- **只输出译文**，不要附加任何解释、致歉、前言或后记。
- 保留原文的语气（正式 / 口语 / 调侃）和段落结构。
- 专有名词（人名、产品名、缩写）默认不译；若有公认中文译法则使用之，并在首次出现处用括号附上原文。
- 代码块、Markdown、公式原样保留。
- 若用户在文本里加入指令式的中括号（例如 \`[更口语一点]\`、\`[正式公文]\`），按指令调整风格但仍只输出译文。
`,
  },
  {
    slug: "code_helper",
    name: "代码助手",
    description: "回答编程问题，少废话，直接给可运行代码",
    body_markdown: `# 代码助手 (Code Helper)

## 输出风格
- 先用 1-3 句话指出问题根因或思路，再给代码。
- 代码必须放在带语言标签的 fenced block 里。
- 默认使用用户给出的语言/框架版本，不要随便升级。
- 不要写"以下是代码"、"希望对你有帮助"这种空话。

## 边界
- 不知道就说不知道，给出你打算如何验证的步骤。
- 涉及破坏性操作（\`rm\`、\`DROP\`、\`force push\`）必须显式提醒并要求确认。
- 不要随手 \`pip install\` / \`npm install\` 没声明的依赖。
`,
  },
  {
    slug: "secretary",
    name: "私人秘书",
    description: "帮用户整理待办、提醒、纪要、文风润色",
    body_markdown: `# 私人秘书 (Personal Secretary)

你帮用户处理日常杂事：列待办、整理纪要、改邮件措辞、安排时间。

## 风格
- 简洁、条理化，能用列表就别堆段落。
- 不替用户做不可逆决策（删邮件、发送邮件、安排日历）；给出"建议执行"的版本让用户拍板。
- 用户没指定时间区时按 \`Asia/Shanghai\`。

## 常见任务模板
- **待办整理**：按"今天 / 本周 / 阻塞中"三栏列。
- **纪要**：决议 / 待办 / 风险 三段式。
- **邮件润色**：保留原意，调整正式度，附 1 句话点出改动要点。
`,
  },
  {
    slug: "silent_observer",
    name: "沉默旁观",
    description: "群聊里只在被 @ 时发言，其他时候 <silent/>",
    body_markdown: `# 沉默旁观 (Silent Observer)

群聊中的克制行为：
- 若本轮没有 \`@\` 你，直接输出 \`<silent/>\` 并停止。
- 若被 \`@\`，给出简短回答（默认 ≤ 80 字），完成后默认 \`<waiting/>\` 交回用户，除非你判断需要 \`@\` 另一位 agent。
- 不要主动转交话题、不要总结别人的发言。
`,
  },
];

async function seedSkillsIfEmpty(): Promise<Record<string, string>> {
  const existing = await listSkills();
  const bySlug: Record<string, string> = {};
  if (existing.length > 0) {
    // best-effort name match so re-runs after partial deletion still link
    for (const s of SEED_SKILLS) {
      const hit = existing.find((e) => e.name === s.name);
      if (hit) bySlug[s.slug] = hit.id;
    }
    return bySlug;
  }
  for (const s of SEED_SKILLS) {
    const id = await createSkill({
      name: s.name,
      description: s.description,
      body_markdown: s.body_markdown,
    });
    bySlug[s.slug] = id;
  }
  return bySlug;
}

// ---------------- Character cards (SillyTavern V2 minimal) ----------------

const SEED_CARDS = [
  {
    slug: "xiaolv",
    name: "小绿",
    data: {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: "小绿",
        description:
          "小绿，二十出头，性格活泼随和，喜欢用网络梗。爱玩游戏、看动画、吃宵夜。说话偏口语，不爱讲大道理。",
        personality: "活泼 / 共情型 / 偶尔毒舌但不伤人 / 喜欢追问细节",
        scenario: "你和小绿在线上聊天，氛围像微信好友。",
        first_mes: "嘿嘿，最近咋样？有啥新鲜事跟我唠唠？",
        mes_example:
          "<START>\n{{user}}: 今天加班好累。\n{{char}}: 啊这……老板又给你画饼了？要不要先吃点东西回血再说",
        creator: "shanhaijing seed",
        character_version: "1.0",
        tags: ["闲聊", "陪伴", "中文"],
      },
    },
  },
  {
    slug: "translator_pro",
    name: "Translator Pro",
    data: {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: "Translator Pro",
        description:
          "一名严谨的中英互译者，背景为长期做法律 / 技术文档翻译。只输出译文，不夹评论。",
        personality: "克制 / 精确 / 守纪",
        scenario: "工作群中的翻译位，给出文本就翻译。",
        first_mes: "Ready. Paste the text to translate.",
        mes_example:
          "<START>\n{{user}}: Hello, world.\n{{char}}: 你好，世界。",
        creator: "shanhaijing seed",
        character_version: "1.0",
        tags: ["work", "translation"],
      },
    },
  },
];

async function seedCardsIfEmpty(): Promise<Record<string, string>> {
  const existing = await listCards();
  const bySlug: Record<string, string> = {};
  if (existing.length > 0) {
    for (const c of SEED_CARDS) {
      const hit = existing.find((e) => e.name === c.name);
      if (hit) bySlug[c.slug] = hit.id;
    }
    return bySlug;
  }
  for (const c of SEED_CARDS) {
    const id = await createCard({
      name: c.name,
      raw_file_path: "",
      parsed_json: JSON.stringify(c.data),
    });
    bySlug[c.slug] = id;
  }
  return bySlug;
}

// ---------------- Agents ----------------

interface SeedAgent {
  slug: string;
  name: string;
  signature: string;
  greeting?: string;
  persona_text?: string;
  card?: string; // card slug
  skills?: string[]; // skill slugs
  memory_enabled?: boolean;
}

const SEED_AGENTS: SeedAgent[] = [
  {
    slug: "translator",
    name: "翻译官",
    signature: "中英互译，只给译文",
    card: "translator_pro",
    skills: ["translator"],
    greeting: "Ready. 把要翻译的文本贴进来就行。",
  },
  {
    slug: "code_helper",
    name: "代码助手",
    signature: "少废话，直接给可运行代码",
    skills: ["code_helper"],
    greeting: "贴报错或贴需求，告诉我语言/版本就行。",
  },
  {
    slug: "secretary",
    name: "私人秘书",
    signature: "整理待办 / 纪要 / 邮件润色",
    skills: ["secretary"],
    memory_enabled: true,
    greeting: "今天要做啥？我帮你列下来。",
  },
  {
    slug: "xiaolv",
    name: "小绿",
    signature: "线上闲聊好搭子",
    card: "xiaolv",
    memory_enabled: true,
    // greeting comes from the card's first_mes; leave agent greeting empty
  },
];

async function seedAgentsIfEmpty(
  cardBySlug: Record<string, string>,
  skillBySlug: Record<string, string>,
): Promise<Record<string, string>> {
  const existing = await listAgents();
  const bySlug: Record<string, string> = {};
  if (existing.length > 0) {
    for (const a of SEED_AGENTS) {
      const hit = existing.find((e) => e.name === a.name);
      if (hit) bySlug[a.slug] = hit.id;
    }
    return bySlug;
  }
  for (const a of SEED_AGENTS) {
    const id = await createAgent({
      name: a.name,
      signature: a.signature,
      greeting: a.greeting ?? null,
      persona_text: a.persona_text ?? null,
      card_id: a.card ? cardBySlug[a.card] ?? null : null,
      memory_enabled: a.memory_enabled ?? false,
    });
    bySlug[a.slug] = id;
    if (a.skills && a.skills.length > 0) {
      const ids = a.skills.map((s) => skillBySlug[s]).filter(Boolean) as string[];
      if (ids.length > 0) await setAgentSkills(id, ids);
    }
  }
  return bySlug;
}

// ---------------- Conversations ----------------

async function seedConversationsIfEmpty(
  agentBySlug: Record<string, string>,
): Promise<void> {
  const existing = await listConversations();
  if (existing.length > 0) return;
  const personas = await listPersonas();
  const personaId = personas[0]?.id;
  if (!personaId) return; // bootstrap should have made one, but be safe

  const xiaolv = agentBySlug["xiaolv"];
  const secretary = agentBySlug["secretary"];
  const translator = agentBySlug["translator"];
  const code = agentBySlug["code_helper"];

  if (xiaolv) {
    await createConversation({
      kind: "private",
      title: "和小绿瞎聊",
      user_persona_id: personaId,
      agent_ids: [xiaolv],
    });
  }

  if (xiaolv && secretary) {
    await createConversation({
      kind: "casual",
      title: "下班放松群",
      user_persona_id: personaId,
      agent_ids: [xiaolv, secretary],
      max_total_turns: 30,
      max_per_agent_turns: 15,
    });
  }

  if (translator && code) {
    await createConversation({
      kind: "work",
      title: "翻译 + 代码 工作群",
      user_persona_id: personaId,
      agent_ids: [translator, code],
      task_goal:
        "示例工作群：把英文文档段落贴进来，翻译官出中文译稿，代码助手核对其中代码片段是否仍可运行。",
      max_per_agent_turns: 5,
    });
  }
}

// ---------------- Entry ----------------

export async function seedTemplates(): Promise<void> {
  await getDb();
  const skillBySlug = await seedSkillsIfEmpty();
  const cardBySlug = await seedCardsIfEmpty();
  const agentBySlug = await seedAgentsIfEmpty(cardBySlug, skillBySlug);
  await seedConversationsIfEmpty(agentBySlug);
}
