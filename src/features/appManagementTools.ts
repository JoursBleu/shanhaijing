import { registerTool } from "@/llm/tools";
import {
  createAgent,
  listAgents,
  setAgentKbIds,
  updateAgent,
} from "@/repos/agents";
import { createSkill, listSkills, setAgentSkills } from "@/repos/skills";
import { createMcpServer, listMcpServers } from "@/repos/mcpServers";
import {
  createKnowledgeBase,
  listKnowledgeBases,
} from "@/repos/knowledge";
import { listProviders } from "@/repos/providers";
import { initMcp } from "@/features/mcpInit";
import { loadExecBackend, saveExecBackend } from "@/features/execConfig";
import type { AgentRuntime, McpMode, ToolMode } from "@/types/domain";
import type { ExecBackendKind } from "@/features/exec";
import { getSystemAssistantId } from "@/features/systemAssistant";
import type { ToolContext } from "@/llm/tools";
import { useData } from "@/stores/data";

registerTool({
  name: "shanhaijing_status",
  description:
    "Inspect Shanhaijing's current providers, agents, skills, MCP servers, knowledge bases, and execution backend before configuring the app.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  autoApprove: true,
  execute: async (_args, ctx) => {
    const denied = await requireSystemAssistant(ctx);
    if (denied) return denied;
    const [providers, agents, skills, mcp, kbs, exec] = await Promise.all([
      listProviders(),
      listAgents(),
      listSkills(),
      listMcpServers(),
      listKnowledgeBases(),
      loadExecBackend(),
    ]);
    return JSON.stringify(
      {
        providers: providers.map((p) => ({ id: p.id, name: p.name, enabled: p.enabled })),
        agents: agents.map((a) => ({
          id: a.id,
          name: a.name,
          providerId: a.default_provider_id,
          model: a.default_model,
          runtime: a.runtime,
        })),
        skills: skills.map((s) => ({ id: s.id, name: s.name, description: s.description })),
        mcpServers: mcp.map((s) => ({ id: s.id, name: s.name, enabled: s.enabled })),
        knowledgeBases: kbs.map((kb) => ({ id: kb.id, name: kb.name, model: kb.embedding_model })),
        execBackend: exec ? { kind: exec.kind, configured: true } : null,
      },
      null,
      2,
    );
  },
});

registerTool({
  name: "shanhaijing_create_agent",
  description:
    "Create a Shanhaijing agent and optionally bind existing skills and knowledge bases by name. This changes application data and requires user approval.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string" },
      persona: { type: "string", description: "Complete system persona/instructions." },
      greeting: { type: "string" },
      provider_name: { type: "string", description: "Existing enabled provider name." },
      model: { type: "string" },
      skill_names: { type: "array", items: { type: "string" } },
      knowledge_base_names: { type: "array", items: { type: "string" } },
      memory_enabled: { type: "boolean" },
      runtime: { type: "string", enum: ["legacy", "dsh"] },
    },
    required: ["name", "persona", "provider_name", "model"],
    additionalProperties: false,
  },
  autoApprove: false,
  execute: async (args, ctx) => {
    const denied = await requireSystemAssistant(ctx);
    if (denied) return denied;
    const name = requiredText(args?.name, "name");
    const persona = requiredText(args?.persona, "persona");
    const provider = await providerByName(requiredText(args?.provider_name, "provider_name"));
    if (!provider) return "Error: enabled provider not found. Use shanhaijing_status first.";
    const model = requiredText(args?.model, "model");
    const id = await createAgent({
      name,
      persona_text: persona,
      greeting: text(args?.greeting) || null,
      default_provider_id: provider.id,
      default_model: model,
      memory_enabled: args?.memory_enabled !== false,
      tool_mode: "auto",
      mcp_mode: "auto",
      max_tool_calls: 8,
      enabled_tools_json: null,
      runtime: asRuntime(args?.runtime),
    });
    const skillIds = await idsByNames(await listSkills(), stringList(args?.skill_names));
    if (skillIds.length) await setAgentSkills(id, skillIds);
    const kbIds = await idsByNames(await listKnowledgeBases(), stringList(args?.knowledge_base_names));
    if (kbIds.length) await setAgentKbIds(id, kbIds);
    await useData.getState().reloadAgents();
    return `Created agent "${name}" (${id}) with ${skillIds.length} skills and ${kbIds.length} knowledge bases.`;
  },
});

registerTool({
  name: "shanhaijing_update_agent",
  description:
    "Update an existing Shanhaijing agent's persona, model, runtime, tools, skills, or knowledge-base bindings. Requires user approval.",
  parameters: {
    type: "object",
    properties: {
      agent_name: { type: "string" },
      persona: { type: "string" },
      greeting: { type: "string" },
      provider_name: { type: "string" },
      model: { type: "string" },
      skill_names: { type: "array", items: { type: "string" } },
      knowledge_base_names: { type: "array", items: { type: "string" } },
      tool_mode: { type: "string", enum: ["auto", "disabled"] },
      mcp_mode: { type: "string", enum: ["auto", "manual", "disabled"] },
      runtime: { type: "string", enum: ["legacy", "dsh"] },
    },
    required: ["agent_name"],
    additionalProperties: false,
  },
  autoApprove: false,
  execute: async (args, ctx) => {
    const denied = await requireSystemAssistant(ctx);
    if (denied) return denied;
    const agent = await agentByName(requiredText(args?.agent_name, "agent_name"));
    if (!agent) return "Error: agent not found.";
    const patch: Parameters<typeof updateAgent>[1] = {};
    if (args?.persona !== undefined) patch.persona_text = text(args.persona) || null;
    if (args?.greeting !== undefined) patch.greeting = text(args.greeting) || null;
    if (args?.model !== undefined) patch.default_model = text(args.model) || null;
    if (args?.runtime !== undefined) patch.runtime = asRuntime(args.runtime);
    if (args?.tool_mode !== undefined) patch.tool_mode = asToolMode(args.tool_mode);
    if (args?.mcp_mode !== undefined) patch.mcp_mode = asMcpMode(args.mcp_mode);
    if (args?.provider_name !== undefined) {
      const provider = await providerByName(text(args.provider_name));
      if (!provider) return "Error: enabled provider not found.";
      patch.default_provider_id = provider.id;
    }
    await updateAgent(agent.id, patch);
    if (Array.isArray(args?.skill_names)) {
      await setAgentSkills(agent.id, await idsByNames(await listSkills(), stringList(args.skill_names)));
    }
    if (Array.isArray(args?.knowledge_base_names)) {
      await setAgentKbIds(agent.id, await idsByNames(await listKnowledgeBases(), stringList(args.knowledge_base_names)));
    }
    await useData.getState().reloadAgents();
    return `Updated agent "${agent.name}".`;
  },
});

registerTool({
  name: "shanhaijing_install_skill",
  description:
    "Create/install a reusable Shanhaijing Skill from supplied Markdown or from an http(s) URL. Requires user approval.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string" },
      description: { type: "string" },
      body_markdown: { type: "string" },
      source_url: { type: "string" },
    },
    required: ["name"],
    additionalProperties: false,
  },
  autoApprove: false,
  execute: async (args, ctx) => {
    const denied = await requireSystemAssistant(ctx);
    if (denied) return denied;
    const name = requiredText(args?.name, "name");
    const url = text(args?.source_url);
    let body = text(args?.body_markdown);
    if (!body && url) {
      if (!/^https?:\/\//i.test(url)) return "Error: source_url must be http(s).";
      const response = await fetch(url, { signal: ctx.signal });
      if (!response.ok) return `Error: skill URL returned HTTP ${response.status}.`;
      body = await response.text();
    }
    if (!body) return "Error: body_markdown or source_url is required.";
    const id = await createSkill({
      name,
      description: text(args?.description),
      body_markdown: body,
      metadata_json: JSON.stringify({ source: "山海小助手", source_url: url || undefined }),
    });
    await useData.getState().reloadSkills();
    return `Installed skill "${name}" (${id}).`;
  },
});

registerTool({
  name: "shanhaijing_install_mcp",
  description:
    "Add and immediately connect a Streamable HTTP/SSE MCP server in Shanhaijing. Requires user approval.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string" },
      url: { type: "string" },
      transport: { type: "string", enum: ["http", "sse"] },
    },
    required: ["name", "url"],
    additionalProperties: false,
  },
  autoApprove: false,
  execute: async (args, ctx) => {
    const denied = await requireSystemAssistant(ctx);
    if (denied) return denied;
    const name = requiredText(args?.name, "name");
    const url = requiredText(args?.url, "url");
    if (!/^https?:\/\//i.test(url)) return "Error: MCP URL must be http(s).";
    const id = await createMcpServer({
      name,
      url,
      transport: args?.transport === "sse" ? "sse" : "http",
      // Credentials must be entered through the settings UI, never chat/tool
      // history where they could be sent to a model or persisted in traces.
      headers: {},
    });
    const status = (await initMcp()).find((item) => item.serverId === id);
    return status?.ok
      ? `Installed MCP "${name}" with ${status.count} tools.`
      : `Saved MCP "${name}", but connection failed: ${status?.error ?? "unknown error"}`;
  },
});

registerTool({
  name: "shanhaijing_create_knowledge_base",
  description:
    "Create a Shanhaijing knowledge base using an existing provider's embedding model. Requires user approval. Document import remains a user file-picker action.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string" },
      provider_name: { type: "string" },
      embedding_model: { type: "string" },
      search_mode: { type: "string", enum: ["vector", "hybrid"] },
      top_k: { type: "number" },
    },
    required: ["name", "provider_name", "embedding_model"],
    additionalProperties: false,
  },
  autoApprove: false,
  execute: async (args, ctx) => {
    const denied = await requireSystemAssistant(ctx);
    if (denied) return denied;
    const provider = await providerByName(requiredText(args?.provider_name, "provider_name"));
    if (!provider) return "Error: enabled provider not found.";
    const name = requiredText(args?.name, "name");
    const id = await createKnowledgeBase({
      name,
      embedding_provider_id: provider.id,
      embedding_model: requiredText(args?.embedding_model, "embedding_model"),
      search_mode: args?.search_mode === "vector" ? "vector" : "hybrid",
      top_k: Math.max(1, Math.min(20, Number(args?.top_k) || 5)),
    });
    return `Created knowledge base "${name}" (${id}). Open 知识库 to import local documents.`;
  },
});

registerTool({
  name: "shanhaijing_configure_exec",
  description:
    "Configure or disable Shanhaijing's run_command execution backend (WSL, Docker, SSH, or unsafe local shell). Requires user approval.",
  parameters: {
    type: "object",
    properties: {
      enabled: { type: "boolean" },
      kind: { type: "string", enum: ["wsl", "docker", "ssh", "local"] },
      target: { type: "string" },
      cwd: { type: "string" },
      timeout_seconds: { type: "number" },
    },
    required: ["enabled"],
    additionalProperties: false,
  },
  autoApprove: false,
  execute: async (args, ctx) => {
    const denied = await requireSystemAssistant(ctx);
    if (denied) return denied;
    if (args?.enabled === false) {
      await saveExecBackend(null);
      return "Disabled command execution.";
    }
    const kind = asExecBackendKind(args?.kind ?? "wsl");
    if ((kind === "docker" || kind === "ssh") && !text(args?.target)) {
      return `Error: ${kind} requires target.`;
    }
    await saveExecBackend({
      kind,
      target: text(args?.target) || null,
      cwd: text(args?.cwd) || null,
      timeoutMs: Math.max(1, Math.min(3600, Number(args?.timeout_seconds) || 60)) * 1000,
    });
    return `Configured execution backend: ${kind}${text(args?.target) ? ` (${text(args.target)})` : ""}.`;
  },
});

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requiredText(value: unknown, name: string): string {
  const result = text(value);
  if (!result) throw new Error(`${name} is required`);
  return result;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

async function providerByName(name: string) {
  const wanted = normalize(name);
  return (await listProviders()).find(
    (provider) => provider.enabled && normalize(provider.name) === wanted,
  );
}

async function agentByName(name: string) {
  const wanted = normalize(name);
  return (await listAgents()).find((agent) => normalize(agent.name) === wanted);
}

async function idsByNames<T extends { id: string; name: string }>(
  values: T[],
  names: string[],
): Promise<string[]> {
  const wanted = new Set(names.map(normalize));
  return values.filter((value) => wanted.has(normalize(value.name))).map((value) => value.id);
}

function asRuntime(value: unknown): AgentRuntime {
  if (value === undefined || value === "legacy") return "legacy";
  if (value === "dsh") return "dsh";
  throw new Error("runtime must be legacy or dsh");
}

function asToolMode(value: unknown): ToolMode {
  if (value === "auto" || value === "disabled") return value;
  throw new Error("tool_mode must be auto or disabled");
}

function asMcpMode(value: unknown): McpMode {
  if (value === "auto" || value === "manual" || value === "disabled") return value;
  throw new Error("mcp_mode must be auto, manual, or disabled");
}

function asExecBackendKind(value: unknown): ExecBackendKind {
  if (value === "wsl" || value === "docker" || value === "ssh" || value === "local") {
    return value;
  }
  throw new Error("kind must be wsl, docker, ssh, or local");
}

async function requireSystemAssistant(ctx: ToolContext): Promise<string | null> {
  const id = await getSystemAssistantId();
  return id && ctx.agentId === id
    ? null
    : "Error: this application-management tool is restricted to 山海小助手.";
}