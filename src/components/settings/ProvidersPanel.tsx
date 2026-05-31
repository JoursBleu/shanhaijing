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
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";

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

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  // Make sure we have a fresh list when this panel mounts.
  useEffect(() => {
    reload();
  }, []);

  async function openNew() {
    setDraft(EMPTY);
    setShowKey(false);
    setMsg(null);
    setOpen(true);
  }

  async function openEdit(p: Provider) {
    const key = p.api_key_encrypted
      ? await decryptSecret(p.api_key_encrypted)
      : "";
    setDraft({
      id: p.id,
      name: p.name,
      base_url: p.base_url,
      api_key: key,
      kind: p.kind,
      enabled: p.enabled,
    });
    setShowKey(false);
    setMsg(null);
    setOpen(true);
  }

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
      setOpen(false);
      setDraft(EMPTY);
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
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Providers</h2>
        <Button onClick={openNew}>+ 新建 provider</Button>
      </div>
      <p className="text-sm text-[var(--color-text-3)]">
        预置了几家常用的（国内 + 本机 Ollama），全部默认未启用。要使用任何一家，
        点击 <b>编辑</b> 填上 API Key 并勾选 "启用"。OpenAI / Anthropic / Google
        等海外服务请用 <b>+ 新建 provider</b> 自行添加（base URL + key）。
      </p>

      {providers.length === 0 ? (
        <div className="border border-dashed border-[var(--color-border)] rounded-md p-6 text-center text-sm text-[var(--color-text-3)]">
          还没有任何 provider。点右上 <b>+ 新建 provider</b> 添加一个，
          base URL 填 OpenAI 兼容端点（如 <code>https://api.openai.com/v1</code>），
          再填上 API Key 就可以开始对话了。
        </div>
      ) : (
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
              <span className="flex-1 text-sm min-w-0">
                <span className="font-medium">{p.name}</span>{" "}
                <span className="text-[var(--color-text-3)]">{p.base_url}</span>
                {!p.api_key_encrypted && (
                  <span className="ml-2 text-xs text-[var(--color-warning,#d97706)]">
                    （未填 API Key）
                  </span>
                )}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={!p.enabled || !p.api_key_encrypted || busy}
                onClick={() => fetchModels(p)}
              >
                抓模型
              </Button>
              <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                编辑
              </Button>
              <Button size="sm" variant="ghost" onClick={() => remove(p)}>
                删除
              </Button>
            </li>
          ))}
        </ul>
      )}

      {msg && (
        <div className="text-xs text-[var(--color-text-3)]">{msg}</div>
      )}

      <Modal
        open={open}
        title={draft.id ? "编辑 provider" : "新建 provider"}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              onClick={save}
              disabled={busy || !draft.name || !draft.base_url}
            >
              保存
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="名称">
            <Input
              autoFocus
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="例如 OpenAI / 我的 vLLM"
            />
          </Field>
          <Field
            label="Base URL"
            hint="OpenAI 兼容端点；通常以 /v1 结尾"
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
              <option value="anthropic">anthropic</option>
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
          {msg && (
            <div className="text-xs text-[var(--color-danger)]">{msg}</div>
          )}
        </div>
      </Modal>
    </div>
  );
}
