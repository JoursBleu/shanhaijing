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
import type { AgentRuntime, McpMode, ToolMode } from "@/types/domain";

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

  useEffect(() => {
    listKnowledgeBases().then(setKbs);
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

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Agents</h2>
      <p className="text-sm text-[var(--color-text-3)]">
        一个 agent = Runtime + 人格 + 默认模型 + 技能 + 能调用的工具和知识库。
      </p>

      {(unconfigured.length > 0 || agents.length > 0) && (
        <div className="border border-[var(--color-border)] rounded-md p-3 space-y-2 bg-[var(--color-bg-3)]/40">
          <div className="text-sm font-medium">
            批量配置
            {unconfigured.length > 0 ? (
              <span className="ml-2 text-xs text-[var(--color-warning,#d97706)]">
                有 {unconfigured.length} / {agents.length} 个 agent 还没选 provider/model
              </span>
            ) : (
              <span className="ml-2 text-xs text-[var(--color-text-3)]">
                所有 agent 都已配置
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
      )}

      <ul className="space-y-1">
        {agents.map((a) => {
          const p = providers.find((x) => x.id === a.default_provider_id);
          return (
            <li
              key={a.id}
              className="flex items-center gap-2 p-2 rounded hover:bg-[var(--color-bg-3)]"
            >
              <div className="size-8 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-xs font-bold">
                {a.name.slice(0, 1)}
              </div>
              <div className="flex-1 text-sm">
                <div className="font-medium">{a.name}</div>
                <div className="text-[var(--color-text-3)] text-xs">
                  {a.runtime === "dsh" ? "DSH" : "Legacy"} · {p?.name ?? "(no provider)"} · {a.default_model ?? "(no model)"}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => startEdit(a.id)}>
                编辑
              </Button>
              <Button size="sm" variant="ghost" onClick={() => remove(a.id)}>
                删除
              </Button>
            </li>
          );
        })}
      </ul>
      <Button variant="secondary" onClick={startNew}>
        + 新建 agent
      </Button>

      {editing && (
        <div className="border-t border-[var(--color-border)] pt-4 space-y-3">
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

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button
              onClick={save}
              disabled={!editing.name.trim() || !editing.provider_id || !editing.model}
            >
              保存
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
