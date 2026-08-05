import { useEffect, useState } from "react";
import { confirmModal } from "@/stores/dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import {
  listMcpServers,
  createMcpServer,
  deleteMcpServer,
  setMcpServerEnabled,
  type McpServer,
} from "@/repos/mcpServers";
import { initMcp, getMcpStatus, type McpStatus } from "@/features/mcpInit";

export function McpPanel() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [status, setStatus] = useState<McpStatus[]>(getMcpStatus());
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    setServers(await listMcpServers());
    setStatus(getMcpStatus());
  }

  useEffect(() => {
    reload();
  }, []);

  async function reconnect() {
    setBusy(true);
    try {
      setStatus(await initMcp());
    } finally {
      setBusy(false);
    }
    await reload();
  }

  async function add() {
    if (!name.trim() || !url.trim()) return;
    await createMcpServer({ name: name.trim(), url: url.trim(), transport: "http" });
    setName("");
    setUrl("");
    await reconnect();
  }

  const statusFor = (id: string) => status.find((s) => s.serverId === id);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-1)]">
          MCP 服务器
        </h2>
        <p className="text-xs text-[var(--color-text-3)]">
          连接 Streamable&nbsp;HTTP 的 MCP 服务器，其工具会加入 agent
          可调用列表（调用时需审批）。stdio 本地服务器暂不支持。
        </p>
      </div>

      <div className="space-y-2 border border-[var(--color-border)] rounded p-3">
        <Field label="名称">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如 my-tools"
          />
        </Field>
        <Field label="URL（Streamable HTTP endpoint）">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…/mcp"
          />
        </Field>
        <div className="flex justify-end">
          <Button onClick={add} disabled={!name.trim() || !url.trim() || busy}>
            添加并连接
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-[var(--color-text-2)]">
          已配置 {servers.length} 个
        </span>
        <Button size="sm" variant="ghost" onClick={reconnect} disabled={busy}>
          {busy ? "连接中…" : "重新连接全部"}
        </Button>
      </div>

      <div className="space-y-2">
        {servers.length === 0 && (
          <div className="text-xs text-[var(--color-text-3)]">
            还没有 MCP 服务器。
          </div>
        )}
        {servers.map((s) => {
          const st = statusFor(s.id);
          return (
            <div
              key={s.id}
              className="border border-[var(--color-border)] rounded p-2 flex items-center gap-3"
            >
              <input
                type="checkbox"
                checked={s.enabled}
                onChange={async (e) => {
                  await setMcpServerEnabled(s.id, e.target.checked);
                  await reconnect();
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate text-[var(--color-text-1)]">
                  {s.name}
                </div>
                <div className="text-xs text-[var(--color-text-3)] truncate">
                  {s.url}
                </div>
                <div className="text-xs">
                  {!s.enabled ? (
                    <span className="text-[var(--color-text-3)]">已停用</span>
                  ) : st ? (
                    st.ok ? (
                      <span className="text-[var(--color-success)]">
                        ✓ {st.count} 个工具
                      </span>
                    ) : (
                      <span className="text-[var(--color-danger)]">
                        ✗ {st.error ?? "连接失败"}
                      </span>
                    )
                  ) : (
                    <span className="text-[var(--color-text-3)]">未连接</span>
                  )}
                </div>
              </div>
              <button
                className="text-xs text-[var(--color-text-3)] hover:text-[var(--color-danger)]"
                onClick={async () => {
                  if (await confirmModal({ title: "删除该 MCP 服务器？", danger: true })) {
                    await deleteMcpServer(s.id);
                    await reconnect();
                  }
                }}
              >
                删除
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
