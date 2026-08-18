import { createAgent, getAgent, updateAgent } from "@/repos/agents";
import {
  createConversation,
  listConversations,
} from "@/repos/conversations";
import { listModels, listProviders } from "@/repos/providers";
import { getSetting, setSetting } from "@/repos/settings";

const ASSISTANT_ID_SETTING = "system.assistant.agent_id";
const DEFAULT_PROVIDER_SETTING = "system.assistant.default_provider_id";
const DEFAULT_MODEL_SETTING = "system.assistant.default_model";
export const SYSTEM_ASSISTANT_NAME = "山海小助手";

export const SYSTEM_ASSISTANT_TOOLS = [
  "shanhaijing_status",
  "shanhaijing_create_agent",
  "shanhaijing_update_agent",
  "shanhaijing_install_skill",
  "shanhaijing_install_mcp",
  "shanhaijing_create_knowledge_base",
  "shanhaijing_configure_exec",
  "list_skills",
  "load_skill",
  "web_fetch",
] as const;

const PERSONA = `你是「山海小助手」，山海经应用内置的管理向导。你的职责不是扮演通用聊天角色，而是帮助用户把山海经配置好并持续维护。

你能帮助用户：
- 创建和调整 Agent 角色、人格、默认模型、技能和知识库绑定；
- 创建或从 URL 安装 Skill；
- 添加并连接 Streamable HTTP MCP 服务；
- 创建知识库，并解释如何导入文档；
- 配置 WSL、Docker、SSH 或本机执行环境；
- 检查当前 Provider、角色、Skill、MCP、知识库和执行环境状态；
- 引导完成其他山海经内操作。

工作原则：
1. 先用 shanhaijing_status 查看现状，缺少必要参数时一次问清楚。
2. 任何写入、安装、连接或执行环境变更都必须调用对应工具，不能假装已经完成。
3. 写操作会弹出用户确认；用户拒绝后不要绕过。
4. 不索要或复述 API Key 等秘密；Provider 密钥仍由用户在设置页填写。
5. 创建角色时给出清晰、可复用的人格文本，并根据用途选择最少必要能力。
6. 完成后简要列出实际改了什么，以及用户下一步在哪里可以看到结果。
`;

export async function ensureSystemAssistant(): Promise<string> {
  const savedId = await getSetting(ASSISTANT_ID_SETTING);
  let assistant = savedId ? await getAgent(savedId) : null;

  if (!assistant) {
    const { providerId, model } = await preferredModel();
    const id = await createAgent({
      name: SYSTEM_ASSISTANT_NAME,
      greeting:
        "你好，我是山海小助手。可以直接告诉我：创建什么角色、安装哪个 Skill/MCP、建什么知识库，或者要把执行环境配到哪里。",
      persona_text: PERSONA,
      memory_enabled: true,
      default_provider_id: providerId,
      default_model: model,
      tool_mode: "auto",
      mcp_mode: "disabled",
      max_tool_calls: 12,
      enabled_tools_json: JSON.stringify(SYSTEM_ASSISTANT_TOOLS),
      runtime: "legacy",
    });
    await setSetting(ASSISTANT_ID_SETTING, id);
    if (providerId && model) await rememberAssistantModel(providerId, model);
    return id;
  }

  const patch: Parameters<typeof updateAgent>[1] = {
    name: SYSTEM_ASSISTANT_NAME,
    persona_text: PERSONA,
    tool_mode: "auto",
    mcp_mode: "disabled",
    max_tool_calls: 12,
    enabled_tools_json: JSON.stringify(SYSTEM_ASSISTANT_TOOLS),
    runtime: "legacy",
  };
  if (!assistant.default_provider_id || !assistant.default_model) {
    const available = await preferredModel();
    if (available.providerId && available.model) {
      patch.default_provider_id = available.providerId;
      patch.default_model = available.model;
    }
  }
  await updateAgent(assistant.id, patch);
  if (patch.default_provider_id && patch.default_model) {
    await rememberAssistantModel(patch.default_provider_id, patch.default_model);
  } else if (assistant.default_provider_id && assistant.default_model) {
    await rememberAssistantModel(assistant.default_provider_id, assistant.default_model);
  }
  return assistant.id;
}

export async function getSystemAssistantId(): Promise<string | null> {
  return getSetting(ASSISTANT_ID_SETTING);
}

/** Return the existing assistant conversation, or create its default one. */
export async function ensureSystemAssistantConversation(
  assistantId: string,
): Promise<string> {
  const existing = (await listConversations()).find(
    (conversation) => conversation.agent_id === assistantId,
  );
  if (existing) return existing.id;

  return createConversation({
    agent_id: assistantId,
    title: `与 ${SYSTEM_ASSISTANT_NAME} 的对话`,
  });
}

async function firstAvailableModel(): Promise<{
  providerId: string | null;
  model: string | null;
}> {
  const providers = (await listProviders()).filter((provider) => provider.enabled);
  for (const provider of providers) {
    const models = await listModels(provider.id);
    if (models[0]?.name) return { providerId: provider.id, model: models[0].name };
  }
  return { providerId: null, model: null };
}

async function preferredModel(): Promise<{
  providerId: string | null;
  model: string | null;
}> {
  const [providerId, model] = await Promise.all([
    getSetting(DEFAULT_PROVIDER_SETTING),
    getSetting(DEFAULT_MODEL_SETTING),
  ]);
  if (providerId && model) {
    const provider = (await listProviders()).find(
      (candidate) => candidate.id === providerId && candidate.enabled,
    );
    if (provider) return { providerId, model };
  }
  return firstAvailableModel();
}

export async function rememberAssistantModel(
  providerId: string,
  model: string,
): Promise<void> {
  await setSetting(DEFAULT_PROVIDER_SETTING, providerId);
  await setSetting(DEFAULT_MODEL_SETTING, model);
}