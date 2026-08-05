import { useEffect, useMemo, useRef, useState } from "react";
import { useData } from "@/stores/data";
import { listModels } from "@/repos/providers";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { getSetting, setSetting } from "@/repos/settings";
import { translate, LANGUAGES } from "@/features/translate";

const SELECT_CLS =
  "h-9 w-full rounded-md bg-[var(--color-bg-3)] px-2.5 text-sm text-[var(--color-text-1)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]";

const K_PROVIDER = "translate.provider_id";
const K_MODEL = "translate.model";
const K_TARGET = "translate.target";

export function TranslatePanel() {
  const allProviders = useData((s) => s.providers);
  const providers = useMemo(
    () => allProviders.filter((p) => p.enabled),
    [allProviders],
  );
  const [providerId, setProviderId] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [source, setSource] = useState("auto");
  const [target, setTarget] = useState("en");
  const [style, setStyle] = useState("");
  const [text, setText] = useState("");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    (async () => {
      setProviderId((await getSetting(K_PROVIDER)) ?? "");
      setModel((await getSetting(K_MODEL)) ?? "");
      setTarget((await getSetting(K_TARGET)) ?? "en");
    })();
  }, []);

  useEffect(() => {
    if (!providerId) return setModels([]);
    listModels(providerId).then((rows) => setModels(rows.map((r) => r.name)));
  }, [providerId]);

  async function run() {
    if (!text.trim() || !providerId || !model || busy) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setErr(null);
    setOut("");
    setCopied(false);
    try {
      await translate({
        providerId,
        model,
        text,
        source,
        target,
        style,
        signal: ac.signal,
        onDelta: setOut,
      });
      await setSetting(K_PROVIDER, providerId);
      await setSetting(K_MODEL, model);
      await setSetting(K_TARGET, target);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function swap() {
    if (source === "auto") return;
    setSource(target);
    setTarget(source);
    setText(out || text);
    setOut("");
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-1)]">
          AI 翻译
        </h2>
        <p className="text-xs text-[var(--color-text-3)]">
          保留 Markdown 结构、代码块和专有名词；只输出译文，不回答原文里的问题。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Provider">
          <select
            className={SELECT_CLS}
            value={providerId}
            onChange={(e) => {
              setProviderId(e.target.value);
              setModel("");
            }}
          >
            <option value="">（选 provider）</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="模型">
          <select
            className={SELECT_CLS}
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="">（选模型）</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex items-end gap-2">
        <Field label="源语言" className="flex-1">
          <select
            className={SELECT_CLS}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
        <button
          className="h-9 px-2 text-[var(--color-text-3)] hover:text-[var(--color-text-1)] disabled:opacity-30"
          onClick={swap}
          disabled={source === "auto"}
          title="互换语言"
        >
          ⇄
        </button>
        <Field label="目标语言" className="flex-1">
          <select
            className={SELECT_CLS}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            {LANGUAGES.filter((l) => l.code !== "auto").map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="领域 / 风格（可选）">
        <Input
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          placeholder="例如 技术文档 / 法律合同 / 口语对白"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className="text-xs text-[var(--color-text-3)]">原文</div>
          <Textarea
            rows={16}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="粘贴要翻译的文本…"
          />
        </div>
        <div className="space-y-1">
          <div className="text-xs text-[var(--color-text-3)] flex items-center">
            译文
            <div className="flex-1" />
            {out && (
              <button
                className="hover:text-[var(--color-text-1)]"
                onClick={async () => {
                  await navigator.clipboard.writeText(out);
                  setCopied(true);
                }}
              >
                {copied ? "已复制" : "复制"}
              </button>
            )}
          </div>
          <Textarea rows={16} value={out} readOnly placeholder="译文会出现在这里…" />
        </div>
      </div>

      {err && <div className="text-xs text-[var(--color-danger)]">{err}</div>}

      <div className="flex justify-end gap-2">
        {busy && (
          <Button variant="ghost" onClick={() => abortRef.current?.abort()}>
            停止
          </Button>
        )}
        <Button onClick={run} disabled={!text.trim() || !model || busy}>
          {busy ? "翻译中…" : "翻译"}
        </Button>
      </div>
    </div>
  );
}
