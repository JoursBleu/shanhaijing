import { useEffect, useState } from "react";
import { useData } from "@/stores/data";
import type { Provider } from "@/types/domain";
import {
  createProvider,
  deleteProvider,
  replaceModels,
  updateProvider,
} from "@/repos/providers";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { listRemoteModels } from "@/llm/openai";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";

interface Draft {
  id?: string;
  name: string;
  base_url: string;
  api_key: string;
  kind: Provider["kind"];
  enabled: boolean;
}

const EMPTY: Draft = {
  name: "",
  base_url: "",
  api_key: "",
  kind: "openai",
  enabled: true,
};

export function ProvidersPanel() {
  const providers = useData((s) => s.providers);
  const reload = useData((s) => s.reloadProviders);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (editingId) {
      const p = providers.find((x) => x.id === editingId);
      if (p) {
        decryptSecret(p.api_key_encrypted).then((k) =>
          setDraft({
            id: p.id,
            name: p.name,
            base_url: p.base_url,
            api_key: k,
            kind: p.kind,
            enabled: p.enabled,
          }),
        );
      }
    }
  }, [editingId, providers]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const enc = draft.api_key
        ? await encryptSecret(draft.api_key)
        : null;
      if (draft.id) {
        await updateProvider(draft.id, {
          name: draft.name,
          base_url: draft.base_url,
          api_key_encrypted: enc,
          kind: draft.kind,
          enabled: draft.enabled,
        });
      } else {
        await createProvider({
          name: draft.name,
          base_url: draft.base_url,
          api_key_encrypted: enc,
          kind: draft.kind,
          enabled: draft.enabled,
        });
      }
      await reload();
      setEditingId(null);
      setDraft(EMPTY);
      setMsg("已保存");
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function fetchModels(p: Provider) {
    setBusy(true);
    setMsg(null);
    try {
      const key = await decryptSecret(p.api_key_encrypted);
      const list = await listRemoteModels({
        base_url: p.base_url,
        api_key: key,
      });
      await replaceModels(
        p.id,
        list.map((m: any) => ({ name: m.id ?? m.name ?? "" })).filter((m) => m.name),
      );
      setMsg(`抓到 ${list.length} 个模型`);
    } catch (e: any) {
      setMsg(`抓取失败：${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: Provider) {
    if (!confirm(`删除 provider "${p.name}"？`)) return;
    await deleteProvider(p.id);
    await reload();
    if (editingId === p.id) {
      setEditingId(null);
      setDraft(EMPTY);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Providers</h2>
      <p className="text-sm text-[var(--color-text-3)]">
        预置 4 家国内可用。OpenAI / Anthropic / Google 等请自己用 "Custom" 添加。
      </p>

      <ul className="space-y-1">
        {providers.map((p) => (
          <li
            key={p.id}
            className="flex items-center gap-2 p-2 rounded hover:bg-[var(--color-bg-3)]"
          >
            <span
              className={
                p.enabled
                  ? "size-2 rounded-full bg-[var(--color-success)]"
                  : "size-2 rounded-full bg-[var(--color-text-3)]"
              }
            />
            <span className="flex-1 text-sm">
              <span className="font-medium">{p.name}</span>{" "}
              <span className="text-[var(--color-text-3)]">{p.base_url}</span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={!p.enabled || !p.api_key_encrypted || busy}
              onClick={() => fetchModels(p)}
            >
              抓模型
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingId(p.id)}>
              编辑
            </Button>
            <Button size="sm" variant="ghost" onClick={() => remove(p)}>
              删除
            </Button>
          </li>
        ))}
      </ul>

      <div className="pt-2">
        <Button
          variant="secondary"
          onClick={() => {
            setEditingId(null);
            setDraft(EMPTY);
          }}
        >
          + 新建 provider
        </Button>
      </div>

      <div className="border-t border-[var(--color-border)] pt-4 space-y-3">
        <div className="text-sm font-semibold">
          {draft.id ? "编辑 provider" : "新建 provider"}
        </div>
        <Field label="名称">
          <Input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </Field>
        <Field
          label="Base URL"
          hint="支持以 /v1 结尾或裸 host，都会自动补全"
        >
          <Input
            value={draft.base_url}
            onChange={(e) => setDraft({ ...draft, base_url: e.target.value })}
            placeholder="https://api.example.com/v1"
          />
        </Field>
        <Field label="API Key">
          <div className="flex items-center gap-2">
            <Input
              type={showKey ? "text" : "password"}
              value={draft.api_key}
              onChange={(e) =>
                setDraft({ ...draft, api_key: e.target.value })
              }
              placeholder="sk-..."
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowKey((v) => !v)}
            >
              {showKey ? "隐藏" : "显示"}
            </Button>
          </div>
        </Field>
        <Field label="协议">
          <select
            className="h-9 w-full rounded-md bg-[var(--color-bg-3)] px-2.5 text-sm focus:outline-none"
            value={draft.kind}
            onChange={(e) =>
              setDraft({ ...draft, kind: e.target.value as Provider["kind"] })
            }
          >
            <option value="openai">openai-compatible</option>
            <option value="ollama">ollama</option>
            <option value="custom">custom</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) =>
              setDraft({ ...draft, enabled: e.target.checked })
            }
          />
          启用
        </label>
        <div className="flex justify-end gap-2">
          {draft.id && (
            <Button
              variant="ghost"
              onClick={() => {
                setEditingId(null);
                setDraft(EMPTY);
              }}
            >
              取消
            </Button>
          )}
          <Button onClick={save} disabled={busy || !draft.name || !draft.base_url}>
            保存
          </Button>
        </div>
        {msg && (
          <div className="text-xs text-[var(--color-text-3)]">{msg}</div>
        )}
      </div>
    </div>
  );
}
// silence unused import for Textarea if not used here
void Textarea;
