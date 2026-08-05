import { useEffect, useState } from "react";
import { confirmModal } from "@/stores/dialog";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { listProviders } from "@/repos/providers";
import type { Provider } from "@/types/domain";
import {
  listKnowledgeBases,
  createKnowledgeBase,
  updateKnowledgeBase,
  deleteKnowledgeBase,
  listDocuments,
  deleteDocument,
  countChunks,
  type KnowledgeBase,
  type KbDocument,
} from "@/repos/knowledge";
import { ingestText } from "@/features/knowledge";
import { extractTextFromFile, FILE_ACCEPT } from "@/lib/extractText";

const SELECT_CLS =
  "h-9 w-full rounded-md bg-[var(--color-bg-3)] px-2.5 text-sm text-[var(--color-text-1)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]";

export function KnowledgePanel() {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [providerId, setProviderId] = useState("");
  const [model, setModel] = useState("BAAI/bge-m3");

  async function reload() {
    const list = await listKnowledgeBases();
    setKbs(list);
    const c: Record<string, number> = {};
    for (const kb of list) c[kb.id] = await countChunks(kb.id);
    setCounts(c);
  }

  useEffect(() => {
    reload();
    listProviders().then((p) => {
      setProviders(p);
      setProviderId((cur) => cur || (p[0]?.id ?? ""));
    });
  }, []);

  async function createKb() {
    if (!name.trim() || !model.trim()) return;
    await createKnowledgeBase({
      name: name.trim(),
      embedding_provider_id: providerId || null,
      embedding_model: model.trim(),
    });
    setName("");
    await reload();
  }

  const selected = kbs.find((k) => k.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-1)]">
          知识库 · RAG
        </h2>
        <p className="text-xs text-[var(--color-text-3)]">
          上传文档后，agent 可通过 <code>search_knowledge</code>{" "}
          工具检索相关片段来回答问题。检索用所选 provider 的 embedding
          模型（需该 provider 支持 <code>/v1/embeddings</code>）。
        </p>
      </div>

      <div className="space-y-2 border border-[var(--color-border)] rounded p-3">
        <Field label="名称">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如 产品手册"
          />
        </Field>
        <Field label="Embedding Provider">
          <select
            className={SELECT_CLS}
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
          >
            {providers.length === 0 && (
              <option value="">（无 provider，请先在 ⚙ 设置里添加）</option>
            )}
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Embedding 模型">
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="BAAI/bge-m3 / text-embedding-3-small …"
          />
        </Field>
        <div className="flex justify-end">
          <Button
            onClick={createKb}
            disabled={!name.trim() || !model.trim() || !providerId}
          >
            新建知识库
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {kbs.length === 0 && (
          <div className="text-xs text-[var(--color-text-3)]">
            还没有知识库。
          </div>
        )}
        {kbs.map((kb) => (
          <div
            key={kb.id}
            className="border border-[var(--color-border)] rounded"
          >
            <div className="p-2 flex items-center gap-3">
              <button
                className="flex-1 min-w-0 text-left"
                onClick={() =>
                  setSelectedId(selectedId === kb.id ? null : kb.id)
                }
              >
                <div className="text-sm font-medium truncate text-[var(--color-text-1)]">
                  {selectedId === kb.id ? "▾ " : "▸ "}
                  {kb.name}
                </div>
                <div className="text-xs text-[var(--color-text-3)] truncate">
                  {kb.embedding_model} · {counts[kb.id] ?? 0} 个片段
                </div>
              </button>
              <button
                className="text-xs text-[var(--color-text-3)] hover:text-[var(--color-danger)]"
                onClick={async () => {
                  if (await confirmModal({ title: `删除知识库「${kb.name}」？`, body: "其中全部文档会一起删除。", danger: true })) {
                    if (selectedId === kb.id) setSelectedId(null);
                    await deleteKnowledgeBase(kb.id);
                    await reload();
                  }
                }}
              >
                删除
              </button>
            </div>
            {selected?.id === kb.id && (
              <div className="border-t border-[var(--color-border)] p-3">
                <KbDetail kb={kb} providers={providers} onChanged={reload} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function KbDetail({
  kb,
  providers,
  onChanged,
}: {
  kb: KnowledgeBase;
  providers: Provider[];
  onChanged: () => void;
}) {
  const [docs, setDocs] = useState<KbDocument[]>([]);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function reloadDocs() {
    setDocs(await listDocuments(kb.id));
  }
  useEffect(() => {
    reloadDocs();
  }, [kb.id]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErr(null);
    setMsg(null);
    setExtracting(true);
    try {
      const t = await extractTextFromFile(f);
      setText(t);
      if (!title.trim()) setTitle(f.name);
      if (!t.trim()) {
        setErr("没抽到文本（可能是扫描版 PDF / 加密文档）。");
      }
    } catch (e: any) {
      setErr(`解析失败：${e?.message ?? e}`);
    } finally {
      setExtracting(false);
    }
  }

  async function ingest() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await ingestText({
        kbId: kb.id,
        title: title.trim() || "未命名文档",
        text,
      });
      setMsg(`已入库 ${r.chunks} 个片段`);
      setTitle("");
      setText("");
      await reloadDocs();
      onChanged();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <RetrievalSettings kb={kb} providers={providers} />

      <div className="space-y-2">
        <Field label="文档标题">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="标题（选文件会自动填）"
          />
        </Field>
        <Field label="内容（粘贴文本，或选 PDF/Word/Excel/PPT/EPUB/CSV/HTML 文件）">
          <Textarea
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="把要入库的文本粘贴到这里…"
          />
        </Field>
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept={FILE_ACCEPT}
            onChange={onFile}
            className="text-xs text-[var(--color-text-3)]"
          />
          {extracting && (
            <span className="text-xs text-[var(--color-text-3)]">解析中…</span>
          )}
          <div className="flex-1" />
          <Button onClick={ingest} disabled={!text.trim() || busy || extracting}>
            {busy ? "入库中…" : "入库"}
          </Button>
        </div>
        {msg && (
          <div className="text-xs text-[var(--color-success)]">{msg}</div>
        )}
        {err && (
          <div className="text-xs text-[var(--color-danger)]">{err}</div>
        )}
      </div>

      <div className="space-y-1">
        <div className="text-xs text-[var(--color-text-3)]">
          文档 {docs.length} 篇
        </div>
        {docs.map((d) => (
          <div
            key={d.id}
            className="flex items-center gap-2 text-sm border border-[var(--color-border)] rounded px-2 py-1"
          >
            <div className="flex-1 min-w-0">
              <div className="truncate text-[var(--color-text-1)]">
                {d.title}
              </div>
              <div className="text-xs text-[var(--color-text-3)]">
                {d.char_count} 字
              </div>
            </div>
            <button
              className="text-xs text-[var(--color-text-3)] hover:text-[var(--color-danger)]"
              onClick={async () => {
                if (await confirmModal({ title: `删除文档「${d.title}」？`, danger: true })) {
                  await deleteDocument(d.id);
                  await reloadDocs();
                  onChanged();
                }
              }}
            >
              删除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Per-KB retrieval tuning. Chunking applies to documents ingested afterwards —
 * existing chunks are not re-split, so changing it mid-life mixes granularities.
 */
function RetrievalSettings({
  kb,
  providers,
}: {
  kb: KnowledgeBase;
  providers: Provider[];
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(kb);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(kb);
    setSaved(false);
  }, [kb.id]);

  const set = <K extends keyof KnowledgeBase>(k: K, v: KnowledgeBase[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setSaved(false);
  };

  async function save() {
    await updateKnowledgeBase(kb.id, {
      chunk_size: Number(draft.chunk_size) || 900,
      chunk_overlap: Number(draft.chunk_overlap) || 0,
      search_mode: draft.search_mode,
      top_k: Number(draft.top_k) || 5,
      rerank_provider_id: draft.rerank_model ? draft.rerank_provider_id : null,
      rerank_model: draft.rerank_model?.trim() || null,
    });
    setSaved(true);
  }

  return (
    <div className="border border-[var(--color-border)] rounded">
      <button
        className="w-full text-left px-2 py-1.5 text-xs text-[var(--color-text-2)]"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "▾" : "▸"} 检索设置 · {draft.search_mode === "hybrid" ? "混合检索" : "向量检索"}
        {draft.rerank_model ? " + 重排" : ""} · top {draft.top_k}
      </button>
      {open && (
        <div className="border-t border-[var(--color-border)] p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="分块大小（字符）">
              <Input
                type="number"
                value={draft.chunk_size}
                onChange={(e) => set("chunk_size", Number(e.target.value))}
              />
            </Field>
            <Field label="分块重叠">
              <Input
                type="number"
                value={draft.chunk_overlap}
                onChange={(e) => set("chunk_overlap", Number(e.target.value))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="检索方式">
              <select
                className={SELECT_CLS}
                value={draft.search_mode}
                onChange={(e) => set("search_mode", e.target.value as any)}
              >
                <option value="hybrid">混合（向量 + 关键词，RRF 融合）</option>
                <option value="vector">纯向量</option>
              </select>
            </Field>
            <Field label="返回片段数 top-K">
              <Input
                type="number"
                value={draft.top_k}
                onChange={(e) => set("top_k", Number(e.target.value))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="重排 Provider">
              <select
                className={SELECT_CLS}
                value={draft.rerank_provider_id ?? ""}
                onChange={(e) =>
                  set("rerank_provider_id", e.target.value || null)
                }
              >
                <option value="">（同 embedding provider）</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="重排模型（留空关闭）">
              <Input
                value={draft.rerank_model ?? ""}
                onChange={(e) => set("rerank_model", e.target.value || null)}
                placeholder="BAAI/bge-reranker-v2-m3"
              />
            </Field>
          </div>
          <p className="text-xs text-[var(--color-text-3)]">
            分块设置只影响之后入库的文档。重排需要 provider 支持{" "}
            <code>/v1/rerank</code>，失败时自动回退到融合排序。
          </p>
          <div className="flex justify-end items-center gap-2">
            {saved && (
              <span className="text-xs text-[var(--color-success)]">已保存</span>
            )}
            <Button onClick={save}>保存检索设置</Button>
          </div>
        </div>
      )}
    </div>
  );
}
