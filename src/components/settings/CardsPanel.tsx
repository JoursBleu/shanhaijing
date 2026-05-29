import { useRef, useState } from "react";
import { useData } from "@/stores/data";
import { Button } from "@/components/ui/Button";
import { parseCharacterCardFromPng } from "@/lib/png";
import { createCard, deleteCard } from "@/repos/cards";

export function CardsPanel() {
  const cards = useData((s) => s.cards);
  const reloadCards = useData((s) => s.reloadCards);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr(null);
    setBusy(true);
    try {
      const buf = await f.arrayBuffer();
      const card = parseCharacterCardFromPng(buf);
      const name = card.data?.name?.trim() || f.name.replace(/\.png$/i, "");
      await createCard({
        name,
        raw_file_path: f.name,
        parsed_json: JSON.stringify(card),
      });
      await reloadCards();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(id: string) {
    if (!confirm("删除这张卡？已绑定该卡的 agent 会自动解绑。")) return;
    await deleteCard(id);
    await reloadCards();
    setPreview((p) => (p === id ? null : p));
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold">角色卡 / Character Cards</h2>
        <p className="text-xs text-[var(--color-text-3)] mt-1">
          支持 SillyTavern V2 / V3 PNG 卡（卡文里包含 <code>chara</code> / <code>ccv3</code> tEXt chunk）。
          导入后可以在 👥 Agents 把卡绑到一个 agent。
        </p>
      </header>

      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png"
          className="hidden"
          onChange={onFile}
        />
        <Button onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? "解析中…" : "导入 PNG 卡"}
        </Button>
        {err && (
          <div className="mt-2 text-xs text-[var(--color-danger)]">{err}</div>
        )}
      </div>

      <section className="space-y-2">
        <h3 className="text-sm text-[var(--color-text-3)]">
          已导入（{cards.length}）
        </h3>
        {cards.length === 0 ? (
          <div className="text-sm text-[var(--color-text-3)]">还没有卡。</div>
        ) : (
          <ul className="space-y-1">
            {cards.map((c) => {
              let data: any = {};
              try {
                data = JSON.parse(c.parsed_json)?.data ?? {};
              } catch {}
              return (
                <li
                  key={c.id}
                  className="border border-[var(--color-border)] rounded p-3"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-[var(--color-text-3)]">
                        {data.creator ?? ""}
                        {data.character_version ? ` · v${data.character_version}` : ""}
                        {data.tags?.length ? ` · ${data.tags.slice(0, 4).join(", ")}` : ""}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setPreview((p) => (p === c.id ? null : c.id))
                        }
                      >
                        {preview === c.id ? "收起" : "预览"}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => remove(c.id)}>
                        删
                      </Button>
                    </div>
                  </div>
                  {preview === c.id && (
                    <pre className="text-xs mt-3 max-h-80 overflow-auto bg-[var(--color-bg-0)] p-2 rounded">
{JSON.stringify(data, null, 2)}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
