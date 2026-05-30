import { useEffect, useState } from "react";
import { useData } from "@/stores/data";
import {
  createAgent,
  deleteAgent,
  updateAgent,
} from "@/repos/agents";
import { listModels } from "@/repos/providers";
import { listAgentSkills, setAgentSkills } from "@/repos/skills";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";

interface Draft {
  id?: string;
  name: string;
  signature: string;
  persona_text: string;
  greeting: string;
  provider_id: string;
  model: string;
  temperature: number;
  top_p: number;
  max_tokens: string;
  card_id: string;
  skill_ids: string[];
}

const EMPTY: Draft = {
  name: "",
  signature: "",
  persona_text: "",
  greeting: "",
  provider_id: "",
  model: "",
  temperature: 0.7,
  top_p: 1,
  max_tokens: "",
  card_id: "",
  skill_ids: [],
};

export function AgentsPanel() {
  const agents = useData((s) => s.agents);
  const providers = useData((s) => s.providers);
  const cards = useData((s) => s.cards);
  const skills = useData((s) => s.skills);
  const reload = useData((s) => s.reloadAgents);

  const [editing, setEditing] = useState<Draft | null>(null);
  const [modelOptions, setModelOptions] = useState<string[]>([]);

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
      signature: a.signature,
      persona_text: a.persona_text ?? "",
      greeting: a.greeting ?? "",
      provider_id: a.default_provider_id ?? "",
      model: a.default_model ?? "",
      temperature: a.default_temperature,
      top_p: a.default_top_p,
      max_tokens: a.default_max_tokens?.toString() ?? "",
      card_id: a.card_id ?? "",
      skill_ids: [],
    });
    listAgentSkills(a.id).then((rows) =>
      setEditing((prev) =>
        prev && prev.id === a.id
          ? { ...prev, skill_ids: rows.map((s) => s.id) }
          : prev,
      ),
    );
  }
  async function save() {
    if (!editing || !editing.name.trim() || !editing.provider_id || !editing.model)
      return;
    const payload = {
      name: editing.name.trim(),
      signature: editing.signature,
      persona_text: editing.persona_text || null,
      greeting: editing.greeting || null,
      default_provider_id: editing.provider_id,
      default_model: editing.model,
      default_temperature: editing.temperature,
      default_top_p: editing.top_p,
      default_max_tokens: editing.max_tokens
        ? Number(editing.max_tokens)
        : null,
      card_id: editing.card_id || null,
    };
    let agentId: string;
    if (editing.id) {
      await updateAgent(editing.id, payload);
      agentId = editing.id;
    } else {
      agentId = await createAgent(payload);
    }
    await setAgentSkills(agentId, editing.skill_ids);
    await reload();
    setEditing(null);
  }
  async function remove(id: string) {
    if (!confirm("删除这个 agent？所有相关对话也会随之删除。")) return;
    await deleteAgent(id);
    await reload();
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Agents（好友）</h2>
      <p className="text-sm text-[var(--color-text-3)]">
        每个 agent 是一个独立的"人"：名字、签名、人格、默认模型。v0.3
        起可以加角色卡、Skill 和记忆。
      </p>

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
                  {p?.name ?? "(no provider)"} · {a.default_model ?? "(no model)"}
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
          <Field label="签名（一行简介）">
            <Input
              value={editing.signature}
              onChange={(e) =>
                setEditing({ ...editing, signature: e.target.value })
              }
            />
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
            <Field label="角色卡（可选）" hint="选定后会覆盖人格 / 系统提示">
              <select
                className="h-9 w-full rounded-md bg-[var(--color-bg-3)] px-2.5 text-sm"
                value={editing.card_id}
                onChange={(e) =>
                  setEditing({ ...editing, card_id: e.target.value })
                }
              >
                <option value="">（不绑卡）</option>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
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
