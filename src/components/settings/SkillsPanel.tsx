import { useEffect, useState } from "react";
import { useData } from "@/stores/data";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import {
  createSkill,
  deleteSkill,
  updateSkill,
} from "@/repos/skills";

export function SkillsPanel() {
  const skills = useData((s) => s.skills);
  const reloadSkills = useData((s) => s.reloadSkills);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!editingId) {
      setName("");
      setDescription("");
      setBody("");
      return;
    }
    const s = skills.find((x) => x.id === editingId);
    if (s) {
      setName(s.name);
      setDescription(s.description);
      setBody(s.body_markdown);
    }
  }, [editingId, skills]);

  async function save() {
    if (!name.trim()) return;
    if (editingId === "__new__") {
      await createSkill({ name, description, body_markdown: body });
    } else if (editingId) {
      await updateSkill(editingId, {
        name,
        description,
        body_markdown: body,
      });
    }
    await reloadSkills();
    setEditingId(null);
  }

  async function remove(id: string) {
    if (!confirm("删除这个技能？已绑定的 agent 会自动取消绑定。")) return;
    await deleteSkill(id);
    await reloadSkills();
    if (editingId === id) setEditingId(null);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">技能 / Skills</h2>
          <p className="text-xs text-[var(--color-text-3)] mt-1">
            技能是按需注入到 system prompt 的小段 Markdown 指南（灵感来自 Claude Skills）。
            在 👥 Agents 里给 agent 挂上技能即可启用。
          </p>
        </div>
        {!editingId && (
          <Button onClick={() => setEditingId("__new__")}>新建技能</Button>
        )}
      </header>

      {editingId && (
        <div className="border border-[var(--color-border)] rounded p-4 space-y-3">
          <Field label="名字">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="简介（一句话，只给人看）">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field
            label="内容（Markdown，会拼到 system prompt）"
            hint="可以加 frontmatter，但 v0.3 不解析"
          >
            <Textarea
              rows={14}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="font-mono text-xs"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditingId(null)}>
              取消
            </Button>
            <Button onClick={save} disabled={!name.trim() || !body.trim()}>
              保存
            </Button>
          </div>
        </div>
      )}

      <section className="space-y-2">
        <h3 className="text-sm text-[var(--color-text-3)]">
          全部技能（{skills.length}）
        </h3>
        {skills.length === 0 ? (
          <div className="text-sm text-[var(--color-text-3)]">还没有技能。</div>
        ) : (
          <ul className="space-y-1">
            {skills.map((s) => (
              <li
                key={s.id}
                className="border border-[var(--color-border)] rounded p-3 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-[var(--color-text-3)] truncate">
                    {s.description || s.body_markdown.slice(0, 100)}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(s.id)}>
                    编辑
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => remove(s.id)}>
                    删
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
