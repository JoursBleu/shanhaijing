import { useEffect, useState } from "react";
import { confirmModal } from "@/stores/dialog";
import { useData } from "@/stores/data";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import {
  createBackup,
  restoreBackup,
  backupStats,
  backupFilename,
  loadWebdavConfig,
  saveWebdavConfig,
  testWebdav,
  uploadBackup,
  listRemoteBackups,
  downloadBackup,
  deleteRemoteBackup,
  type BackupFile,
  type RemoteBackup,
  type WebdavConfig,
} from "@/features/backup";

const EMPTY_CFG: WebdavConfig = {
  url: "",
  username: "",
  password: "",
  path: "/shanhaijing",
};

export function BackupPanel() {
  const reloadAll = useData((s) => s.reloadAll);
  const [cfg, setCfg] = useState<WebdavConfig>(EMPTY_CFG);
  const [remote, setRemote] = useState<RemoteBackup[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadWebdavConfig().then(setCfg);
  }, []);

  function report(fn: () => Promise<string | void>, label: string) {
    return async () => {
      setBusy(label);
      setMsg(null);
      setErr(null);
      try {
        const r = await fn();
        if (typeof r === "string") setMsg(r);
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      } finally {
        setBusy(null);
      }
    };
  }

  const exportLocal = report(async () => {
    const backup = await createBackup();
    const s = backupStats(backup);
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = backupFilename();
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
    return `已导出 ${s.rows} 行 / ${s.tables} 张表`;
  }, "export");

  async function applyRestore(backup: BackupFile, from: string) {
    const ok = await confirmModal({
      title: "覆盖本地全部数据？",
      body: `将用「${from}」替换当前所有 provider、agent、对话、记忆和知识库。此操作不可撤销。`,
      confirmText: "覆盖并恢复",
      danger: true,
    });
    if (!ok) return "";
    const s = await restoreBackup(backup);
    await reloadAll();
    return `已恢复 ${s.rows} 行`;
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    await report(async () => {
      const backup = JSON.parse(await f.text()) as BackupFile;
      return applyRestore(backup, f.name);
    }, "restore")();
  }

  const saveCfg = report(async () => {
    await saveWebdavConfig(cfg);
    return "已保存 WebDAV 配置";
  }, "save");

  const test = report(async () => {
    await testWebdav(cfg);
    return "连接正常";
  }, "test");

  const upload = report(async () => {
    await saveWebdavConfig(cfg);
    const name = await uploadBackup(cfg, await createBackup());
    setRemote(await listRemoteBackups(cfg));
    return `已上传 ${name}`;
  }, "upload");

  const refresh = report(async () => {
    setRemote(await listRemoteBackups(cfg));
  }, "list");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-1)]">
          备份与恢复
        </h2>
        <p className="text-xs text-[var(--color-text-3)]">
          备份包含 provider、agent、角色卡、技能、对话、记忆、知识库和 MCP
          配置。API Key 以本机加密形式导出，换机后需要重新填写。
        </p>
      </div>

      <div className="space-y-2 border border-[var(--color-border)] rounded p-3">
        <div className="text-sm font-medium text-[var(--color-text-1)]">
          本地文件
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={exportLocal} disabled={busy === "export"}>
            {busy === "export" ? "导出中…" : "导出到文件"}
          </Button>
          <label className="text-xs text-[var(--color-text-3)] cursor-pointer">
            <span className="underline">从文件恢复</span>
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={onFile}
            />
          </label>
        </div>
      </div>

      <div className="space-y-2 border border-[var(--color-border)] rounded p-3">
        <div className="text-sm font-medium text-[var(--color-text-1)]">
          WebDAV 同步
        </div>
        <Field label="服务器地址" hint="例如 https://dav.jianguoyun.com/dav/">
          <Input
            value={cfg.url}
            onChange={(e) => setCfg({ ...cfg, url: e.target.value })}
            placeholder="https://dav.example.com/dav/"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="用户名">
            <Input
              value={cfg.username}
              onChange={(e) => setCfg({ ...cfg, username: e.target.value })}
            />
          </Field>
          <Field label="密码 / 应用密码">
            <Input
              type="password"
              value={cfg.password}
              onChange={(e) => setCfg({ ...cfg, password: e.target.value })}
            />
          </Field>
        </div>
        <Field label="远程目录">
          <Input
            value={cfg.path}
            onChange={(e) => setCfg({ ...cfg, path: e.target.value })}
            placeholder="/shanhaijing"
          />
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={test} disabled={!!busy}>
            {busy === "test" ? "测试中…" : "测试连接"}
          </Button>
          <Button variant="ghost" onClick={saveCfg} disabled={!!busy}>
            保存配置
          </Button>
          <Button variant="ghost" onClick={refresh} disabled={!!busy}>
            {busy === "list" ? "读取中…" : "刷新备份列表"}
          </Button>
          <Button onClick={upload} disabled={!!busy || !cfg.url.trim()}>
            {busy === "upload" ? "上传中…" : "立即备份到 WebDAV"}
          </Button>
        </div>

        {remote.length > 0 && (
          <div className="space-y-1 pt-2">
            <div className="text-xs text-[var(--color-text-3)]">
              远程备份 {remote.length} 份
            </div>
            {remote.map((r) => (
              <div
                key={r.name}
                className="flex items-center gap-2 text-sm border border-[var(--color-border)] rounded px-2 py-1"
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate text-[var(--color-text-1)]">
                    {r.name}
                  </div>
                  <div className="text-xs text-[var(--color-text-3)]">
                    {r.size != null ? `${(r.size / 1024).toFixed(0)} KB` : ""}
                    {r.modified ? ` · ${r.modified}` : ""}
                  </div>
                </div>
                <button
                  className="text-xs text-[var(--color-text-3)] hover:text-[var(--color-text-1)]"
                  onClick={report(async () => {
                    const backup = await downloadBackup(cfg, r.name);
                    return applyRestore(backup, r.name);
                  }, "restore")}
                >
                  恢复
                </button>
                <button
                  className="text-xs text-[var(--color-text-3)] hover:text-[var(--color-danger)]"
                  onClick={report(async () => {
                    if (
                      !(await confirmModal({
                        title: `删除远程备份「${r.name}」？`,
                        danger: true,
                      }))
                    )
                      return "";
                    await deleteRemoteBackup(cfg, r.name);
                    setRemote(await listRemoteBackups(cfg));
                    return "已删除";
                  }, "delete")}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {msg && <div className="text-xs text-[var(--color-success)]">{msg}</div>}
      {err && <div className="text-xs text-[var(--color-danger)]">{err}</div>}
    </div>
  );
}
