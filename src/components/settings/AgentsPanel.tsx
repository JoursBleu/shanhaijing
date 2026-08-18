import { useEffect, useState } from "react";
import { confirmModal } from "@/stores/dialog";
import { useData } from "@/stores/data";
import {
  createAgent,
  deleteAgent,
  updateAgent,
  listAgentKbIds,
  setAgentKbIds,
} from "@/repos/agents";
import { listModels } from "@/repos/providers";
import { listAgentSkills, setAgentSkills } from "@/repos/skills";
import { listKnowledgeBases, type KnowledgeBase } from "@/repos/knowledge";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import type { AgentRuntime, McpMode, ToolMode } from "@/types/domain";
import { Bot, Brain, Pencil, Plus, Sparkles, Trash2, Wrench } from "lucide-react";
import {
  getSystemAssistantId,
  rememberAssistantModel,
} from "@/features/systemAssistant";

interface Draft {
  id?: string;
  name: string;
  persona_text: string;
  greeting: string;
  provider_id: string;
  model: string;
  temperature: number;
  top_p: number;
  max_tokens: string;
  skill_ids: string[];
  tool_mode: ToolMode;
  mcp_mode: McpMode;
  max_tool_calls: number;
  kb_ids: string[];
  runtime: AgentRuntime;
}

const EMPTY: Draft = {
  name: "",
  persona_text: "",
  greeting: "",
  provider_id: "",
  model: "",
  temperature: 0.7,
  top_p: 1,
  max_tokens: "",
  skill_ids: [],
  tool_mode: "auto",
  mcp_mode: "auto",
  max_tool_calls: 6,
  kb_ids: [],
  runtime: "legacy",
};

export function AgentsPanel() {
  const agents = useData((s) => s.agents);
  const providers = useData((s) => s.providers);
  const skills = useData((s) => s.skills);
  const reload = useData((s) => s.reloadAgents);

  const [editing, setEditing] = useState<Draft | null>(null);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [systemAssistantId, setSystemAssistantId] = useState<string | null>(null);

  useEffect(() => {
    listKnowledgeBases().then(setKbs);
    getSystemAssistantId().then(setSystemAssistantId);
  }, []);

  // --- Bulk assign default provider/model to unconfigured agents ---
  const unconfigured = agents.filter(
    (a) => !a.default_provider_id || !a.default_model,
  );
  const [bulkProvider, setBulkProvider] = useState<string>("");
  const [bulkModel, setBulkModel] = useState<string>("");
  const [bulkModelOptions, setBulkModelOptions] = useState<string[]>([]);
  const [bulkOverwrite, setBulkOverwrite] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!bulkProvider) {
      setBulkModelOptions([]);
      setBulkModel("");
      return;
    }
    listModels(bulkProvider).then((rows) => {
      setBulkModelOptions(rows.map((r) => r.name));
      setBulkModel((m) => (rows.some((r) => r.name === m) ? m : ""));
    });
  }, [bulkProvider]);

  async function bulkApply() {
    if (!bulkProvider || !bulkModel) return;
    const targets = bulkOverwrite ? agents : unconfigured;
    if (targets.length === 0) return;
    setBulkBusy(true);
    setBulkMsg(null);
    try {
      for (const a of targets) {
        await updateAgent(a.id, {
          default_provider_id: bulkProvider,
          default_model: bulkModel,
        });
      }
      await reload();
      setBulkMsg(`已套用到 ${targets.length} 个 agent`);
    } catch (e: any) {
      setBulkMsg(`失败：${e?.message ?? e}`);
    } finally {
      setBulkBusy(false);
    }
  }

  useEffect(() => {
    if (!editing?.provider_id) {
      setModelOptions([]);
      return;
    }
    listModels(editing.provider_id).then((rows) =>
      setModelOptions(rows.map((r) => r.name)),
    );
  }, [editing?.provider_id]);

  function startNew() {
    setEditing({ ...EMPTY });
  }
  function startEdit(id: string) {
    const a = agents.find((x) => x.id === id);
    if (!a) return;
    setEditing({
      id: a.id,
      name: a.name,
      persona_text: a.persona_text ?? "",
      greeting: a.greeting ?? "",
      provider_id: a.default_provider_id ?? "",
      model: a.default_model ?? "",
      temperature: a.default_temperature,
      top_p: a.default_top_p,
      max_tokens: a.default_max_tokens?.toString() ?? "",
      skill_ids: [],
      tool_mode: a.tool_mode,
      mcp_mode: a.mcp_mode,
      max_tool_calls: a.max_tool_calls,
      kb_ids: [],
      runtime: a.runtime,
    });
    listAgentSkills(a.id).then((rows) =>
      setEditing((prev) =>
        prev && prev.id === a.id
          ? { ...prev, skill_ids: rows.map((s) => s.id) }
          : prev,
      ),
    );
    listAgentKbIds(a.id).then((ids) =>
      setEditing((prev) =>
        prev && prev.id === a.id ? { ...prev, kb_ids: ids } : prev,
      ),
    );
  }
  async function save() {
    if (!editing || !editing.name.trim() || !editing.provider_id || !editing.model)
      return;
    const payload = {
      name: editing.name.trim(),
      persona_text: editing.persona_text || null,
      greeting: editing.greeting || null,
      default_provider_id: editing.provider_id,
      default_model: editing.model,
      default_temperature: editing.temperature,
      default_top_p: editing.top_p,
      default_max_tokens: editing.max_tokens
        ? Number(editing.max_tokens)
        : null,
      tool_mode: editing.tool_mode,
      mcp_mode: editing.mcp_mode,
      max_tool_calls: editing.max_tool_calls,
      runtime: editing.runtime,
    };
    let agentId: string;
    if (editing.id) {
      await updateAgent(editing.id, payload);
      agentId = editing.id;
    } else {
      agentId = await createAgent(payload);
    }
    if (agentId === systemAssistantId) {
      await rememberAssistantModel(editing.provider_id, editing.model);
    }
    await setAgentSkills(agentId, editing.skill_ids);
    await setAgentKbIds(agentId, editing.kb_ids);
    await reload();
    setEditing(null);
  }
  async function remove(id: string) {
    if (!(await confirmModal({ title: "删除这个 agent？", body: "所有相关对话也会随之删除。", danger: true }))) return;
    await deleteAgent(id);
    await reload();
  }

  function cardGradient(name: string): string {
    const palettes = [
      "from-indigo-500 via-violet-500 to-fuchsia-500",
      "from-cyan-500 via-sky-500 to-indigo-500",
      "from-emerald-500 via-teal-500 to-cyan-500",
      "from-amber-400 via-orange-500 to-rose-500",
      "from-pink-500 via-rose-500 to-orange-400",
      "from-violet-500 via-purple-500 to-indigo-500",
    ];
    const hash = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return palettes[hash % palettes.length];
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            <Sparkles className="size-4" />
            角色图鉴
          </div>
          <h2 className="text-2xl font-bold tracking-tight">选择你的 Agent</h2>
          <p className="mt-1 text-sm text-[var(--color-text-3)]">
            每张卡片都是一个独立角色，拥有自己的人格、模型、技能和记忆。
          </p>
        </div>
        <Button onClick={startNew}>
          <Plus className="size-4" /> 新建角色
        </Button>
      </div>

      {(unconfigured.length > 0 || agents.length > 0) && (
        <details className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-3)]/40">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
            <span>批量配置模型</span>
            {unconfigured.length > 0 ? (
              <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs text-amber-500">
                有 {unconfigured.length} / {agents.length} 个 agent 还没选 provider/model
              </span>
            ) : (
              <span className="text-xs text-[var(--color-text-3)]">
                所有 agent 都已配置
              </span>
            )}
          </summary>
          <div className="space-y-3 border-t border-[var(--color-border)] px-4 py-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select
              className="h-9 rounded-md bg-[var(--color-bg-3)] px-2.5 text-sm"
              value={bulkProvider}
              onChange={(e) => setBulkProvider(e.target.value)}
            >
              <option value="">（选 provider）</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.enabled}>
                  {p.name}
                  {p.enabled ? "" : "（未启用）"}
                </option>
              ))}
            </select>
            {bulkModelOptions.length > 0 ? (
              <select
                className="h-9 rounded-md bg-[var(--color-bg-3)] px-2.5 text-sm"
                value={bulkModel}
                onChange={(e) => setBulkModel(e.target.value)}
              >
                <option value="">（选模型）</option>
                {bulkModelOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                value={bulkModel}
                onChange={(e) => setBulkModel(e.target.value)}
                placeholder={
                  bulkProvider
                    ? "可手动输入模型名（或先去 Providers 抓模型）"
                    : "先选 provider"
                }
              />
            )}
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-[var(--color-text-3)]">
              <input
                type="checkbox"
                checked={bulkOverwrite}
                onChange={(e) => setBulkOverwrite(e.target.checked)}
              />
              覆盖已配置的 agent
            </label>
            <div className="flex items-center gap-2">
              {bulkMsg && (
                <span className="text-xs text-[var(--color-text-3)]">{bulkMsg}</span>
              )}
              <Button
                size="sm"
                disabled={
                  bulkBusy ||
                  !bulkProvider ||
                  !bulkModel ||
                  (bulkOverwrite ? agents.length === 0 : unconfigured.length === 0)
                }
                onClick={bulkApply}
              >
                套用到 {bulkOverwrite ? agents.length : unconfigured.length} 个 agent
              </Button>
            </div>
          </div>
          </div>
        </details>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
        {[...agents]
          .sort((a, b) => Number(b.id === systemAssistantId) - Number(a.id === systemAssistantId))
          .map((a) => {
          const p = providers.find((x) => x.id === a.default_provider_id);
          const configured = !!a.default_provider_id && !!a.default_model;
          const isSystemAssistant = a.id === systemAssistantId;
          const persona = a.persona_text?.trim() || "这个角色还没有写下自己的故事。";
          return (
            <article
              key={a.id}
              className="group relative min-h-72 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-1)] shadow-sm transition duration-200 hover:-translate-y-1 hover:border-[var(--color-accent)]/50 hover:shadow-xl"
            >
              <div className={`relative h-28 bg-gradient-to-br ${cardGradient(a.name)}`}>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(255,255,255,.35),transparent_30%),linear-gradient(to_top,rgba(0,0,0,.24),transparent)]" />
                <div className="absolute left-4 top-4 flex items-center gap-2">
                  <span className="rounded-full border border-white/25 bg-black/20 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
                    {a.runtime === "dsh" ? "Harness" : "Legacy"}
                  </span>
                  {isSystemAssistant && (
                    <span className="rounded-full border border-white/25 bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
                      默认助手
                    </span>
                  )}
                </div>
                <div className="absolute -bottom-8 left-5 size-20 overflow-hidden rounded-2xl border-4 border-[var(--color-bg-1)] bg-white/20 shadow-lg backdrop-blur">
                  <div className="flex size-full items-center justify-center text-3xl font-black text-white">
                    {a.name.slice(0, 1)}
                  </div>
                </div>
              </div>

              <div className="flex h-[calc(100%-7rem)] flex-col px-5 pb-4 pt-11">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold leading-tight">{a.name}</h3>
                    <div className={`mt-1 flex items-center gap-1.5 text-xs ${configured ? "text-[var(--color-success)]" : "text-amber-500"}`}>
                      <span className={`size-1.5 rounded-full ${configured ? "bg-[var(--color-success)]" : "bg-amber-500"}`} />
                      {configured ? a.default_model : "等待配置模型"}
                    </div>
                  </div>
                </div>

                <p className="mt-3 line-clamp-3 min-h-[3.75rem] text-sm leading-5 text-[var(--color-text-2)]">
                  {persona}
                </p>

                <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-[var(--color-text-3)]">
                  <span className="inline-flex items-center gap-1 rounded-md bg-[var(--color-bg-3)] px-2 py-1">
                    <Bot className="size-3" /> {p?.name ?? "未选 Provider"}
                  </span>
                  {a.memory_enabled && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-[var(--color-bg-3)] px-2 py-1">
                      <Brain className="size-3" /> 记忆
                    </span>
                  )}
                  {a.tool_mode !== "disabled" && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-[var(--color-bg-3)] px-2 py-1">
                      <Wrench className="size-3" /> 工具
                    </span>
                  )}
                </div>

                <div className="mt-auto flex gap-2 pt-4">
                  <Button className="flex-1" size="sm" onClick={() => startEdit(a.id)}>
                    <Pencil className="size-3.5" /> 编辑角色
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[var(--color-text-3)] hover:text-[var(--color-danger)]"
                    onClick={() => remove(a.id)}
                    disabled={isSystemAssistant}
                    aria-label={`删除 ${a.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </article>
          );
          })}

        <button
          type="button"
          onClick={startNew}
          className="group flex min-h-72 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-bg-3)]/20 p-6 text-center transition hover:border-[var(--color-accent)] hover:bg-[var(--color-accent)]/5"
        >
          <span className="flex size-14 items-center justify-center rounded-2xl bg-[var(--color-bg-3)] text-[var(--color-text-3)] transition group-hover:bg-[var(--color-accent)] group-hover:text-white">
            <Plus className="size-7" />
          </span>
          <span className="mt-4 font-semibold">创造新角色</span>
          <span className="mt-1 text-xs text-[var(--color-text-3)]">赋予它名字、人格和专属能力</span>
        </button>
      </div>

      {editing && (
        <Modal
          open={true}
          title={editing.id ? `编辑角色 · ${editing.name}` : "创造新角色"}
          onClose={() => setEditing(null)}
          panelClassName="w-[min(760px,94vw)]"
          footer={
            <>
              <Button variant="ghost" onClick={() => setEditing(null)}>取消</Button>
              <Button
                onClick={save}
                disabled={!editing.name.trim() || !editing.provider_id || !editing.model}
              >
                保存角色
              </Button>
            </>
          }
        >
        <div className="space-y-4">
          <Field label="名字">
            <Input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </Field>
          <Field
            label="Agent Runtime"
            hint="PoC 阶段需显式选择 Harness；通过兼容与安全门槛后再切为默认。现有会话不会自动迁移"
          >
            <select
              className="h-9 w-full rounded-md bg-[var(--color-bg-3)] px-2.5 text-sm"
              value={editing.runtime}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  runtime: e.target.value as AgentRuntime,
                })
              }
            >
              <option value="dsh">DeepSeek Harness（PoC）</option>
              <option value="legacy">Legacy compatibility runtime</option>
            </select>
          </Field>
          <Field
            label="人格 / System prompt"
            hint="留空则用 “You are {name}.” 作为默认"
          >
            <Textarea
              rows={6}
              value={editing.persona_text}
              onChange={(e) =>
                setEditing({ ...editing, persona_text: e.target.value })
              }
            />
          </Field>
          <Field label="开场白（greeting）" hint="新对话时作为第一句助手消息">
            <Textarea
              rows={2}
              value={editing.greeting}
              onChange={(e) =>
                setEditing({ ...editing, greeting: e.target.value })
              }
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Provider"
              hint={
                providers.filter((p) => p.enabled).length === 0
                  ? "去 ⚙ Providers 填上 base URL + API key 并启用"
                  : ""
              }
            >
              <select
                className="h-9 w-full rounded-md bg-[var(--color-bg-3)] px-2.5 text-sm"
                value={editing.provider_id}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    provider_id: e.target.value,
                    model: "",
                  })
                }
              >
                <option value="">（选 provider）</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.enabled}>
                    {p.name}
                    {p.enabled ? "" : "（未启用）"}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Model"
              hint={modelOptions.length ? "" : "去 Providers 抓一下模型列表"}
            >
              {modelOptions.length ? (
                <select
                  className="h-9 w-full rounded-md bg-[var(--color-bg-3)] px-2.5 text-sm"
                  value={editing.model}
                  onChange={(e) =>
                    setEditing({ ...editing, model: e.target.value })
                  }
                >
                  <option value="">（选模型）</option>
                  {modelOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  value={editing.model}
                  onChange={(e) =>
                    setEditing({ ...editing, model: e.target.value })
                  }
                  placeholder="可手动输入模型名"
                />
              )}
            </Field>
            <Field label="Temperature">
              <Input
                type="number"
                step="0.1"
                value={editing.temperature}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    temperature: Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Top-p">
              <Input
                type="number"
                step="0.05"
                value={editing.top_p}
                onChange={(e) =>
                  setEditing({ ...editing, top_p: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Max tokens（留空 = 不限）">
              <Input
                type="number"
                value={editing.max_tokens}
                onChange={(e) =>
                  setEditing({ ...editing, max_tokens: e.target.value })
                }
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <Field label="技能（可多选）">
              <div className="space-y-1 max-h-48 overflow-auto border border-[var(--color-border)] rounded p-2">
                {skills.length === 0 ? (
                  <div className="text-xs text-[var(--color-text-3)]">
                    还没有技能，去 📜 里建几个。
                  </div>
                ) : (
                  skills.map((sk) => {
                    const checked = editing.skill_ids.includes(sk.id);
                    return (
                      <label
                        key={sk.id}
                        className="flex items-center gap-2 text-sm cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...editing.skill_ids, sk.id]
                              : editing.skill_ids.filter((x) => x !== sk.id);
                            setEditing({ ...editing, skill_ids: next });
                          }}
                        />
                        <span>{sk.name}</span>
                        {sk.description && (
                          <span className="text-xs text-[var(--color-text-3)] truncate">
                            — {sk.description}
                          </span>
                        )}
                      </label>
                    );
                  })
                )}
              </div>
            </Field>
            <Field
              label="能力"
              hint="决定这个 agent 能调用哪些工具、能检索哪些知识库"
            >
              <div className="space-y-2 border border-[var(--color-border)] rounded p-2">
                <div className="grid grid-cols-3 gap-2">
                  <label className="text-xs text-[var(--color-text-3)] space-y-1">
                    <span>内置工具</span>
                    <select
                      className="h-8 w-full rounded-md bg-[var(--color-bg-3)] px-2 text-sm text-[var(--color-text-1)]"
                      value={editing.tool_mode}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          tool_mode: e.target.value as ToolMode,
                        })
                      }
                    >
                      <option value="auto">自动</option>
                      <option value="disabled">关闭</option>
                    </select>
                  </label>
                  <label className="text-xs text-[var(--color-text-3)] space-y-1">
                    <span>MCP 工具</span>
                    <select
                      className="h-8 w-full rounded-md bg-[var(--color-bg-3)] px-2 text-sm text-[var(--color-text-1)]"
                      value={editing.mcp_mode}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          mcp_mode: e.target.value as McpMode,
                        })
                      }
                    >
                      <option value="auto">自动</option>
                      <option value="manual">手动挑选</option>
                      <option value="disabled">关闭</option>
                    </select>
                  </label>
                  <label className="text-xs text-[var(--color-text-3)] space-y-1">
                    <span>单轮工具上限</span>
                    <Input
                      type="number"
                      className="h-8"
                      value={editing.max_tool_calls}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          max_tool_calls: Number(e.target.value) || 6,
                        })
                      }
                    />
                  </label>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-[var(--color-text-3)]">
                    知识库（未勾选则该 agent 不会拿到 search_knowledge 工具）
                  </div>
                  {kbs.length === 0 ? (
                    <div className="text-xs text-[var(--color-text-3)]">
                      还没有知识库，去 📚 里建一个。
                    </div>
                  ) : (
                    kbs.map((kb) => (
                      <label
                        key={kb.id}
                        className="flex items-center gap-2 text-sm cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={editing.kb_ids.includes(kb.id)}
                          onChange={(e) =>
                            setEditing({
                              ...editing,
                              kb_ids: e.target.checked
                                ? [...editing.kb_ids, kb.id]
                                : editing.kb_ids.filter((x) => x !== kb.id),
                            })
                          }
                        />
                        <span>{kb.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </Field>
          </div>

        </div>
        </Modal>
      )}
    </div>
  );
}
