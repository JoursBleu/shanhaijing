import { useState } from "react";
import { useData } from "@/stores/data";
import { useUI } from "@/stores/ui";
import {
  createPersona,
  deletePersona,
  updatePersona,
} from "@/repos/personas";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";

export function PersonasPanel() {
  const personas = useData((s) => s.personas);
  const reload = useData((s) => s.reloadPersonas);
  const activeId = useUI((s) => s.activePersonaId);
  const setActive = useUI((s) => s.setActivePersonaId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");

  function startNew() {
    setEditingId("__new__");
    setName("");
    setBio("");
  }
  function startEdit(id: string) {
    const p = personas.find((x) => x.id === id);
    if (!p) return;
    setEditingId(id);
    setName(p.name);
    setBio(p.bio);
  }
  async function save() {
    if (!name.trim()) return;
    if (editingId === "__new__") {
      const id = await createPersona({ name: name.trim(), bio });
      await reload();
      if (!activeId) setActive(id);
    } else if (editingId) {
      await updatePersona(editingId, { name: name.trim(), bio });
      await reload();
    }
    setEditingId(null);
  }
  async function remove(id: string) {
    if (!confirm("删除这个身份？")) return;
    await deletePersona(id);
    if (activeId === id) setActive(null);
    await reload();
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">User Personas（我的身份）</h2>
      <p className="text-sm text-[var(--color-text-3)]">
        你可以有多个"我"——工作的你、写小说的你、和朋友闲聊的你。
        每个对话用哪个身份开场，agent 收到的 <code>{"{{user}}"}</code> 也对应不同。
      </p>

      <ul className="space-y-1">
        {personas.map((p) => (
          <li
            key={p.id}
            className="flex items-center gap-2 p-2 rounded hover:bg-[var(--color-bg-3)]"
          >
            <input
              type="radio"
              checked={activeId === p.id}
              onChange={() => setActive(p.id)}
            />
            <span className="flex-1 text-sm">
              <span className="font-medium">{p.name}</span>
              {p.bio && (
                <span className="text-[var(--color-text-3)]">
                  {" "}
                  · {p.bio.slice(0, 60)}
                  {p.bio.length > 60 ? "…" : ""}
                </span>
              )}
            </span>
            <Button size="sm" variant="ghost" onClick={() => startEdit(p.id)}>
              编辑
            </Button>
            <Button size="sm" variant="ghost" onClick={() => remove(p.id)}>
              删除
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="secondary" onClick={startNew}>
        + 新建身份
      </Button>

      {editingId && (
        <div className="border-t border-[var(--color-border)] pt-4 space-y-3">
          <Field label="名字">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field
            label="自我介绍 / Bio"
            hint="会作为 {{user}} 注入到 agent 的 system prompt"
          >
            <Textarea
              rows={5}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="名字 / 职业 / 偏好 / 想让 agent 知道的事..."
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditingId(null)}>
              取消
            </Button>
            <Button onClick={save} disabled={!name.trim()}>
              保存
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
