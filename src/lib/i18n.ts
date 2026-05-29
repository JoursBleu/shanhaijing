/**
 * Lightweight i18n: dictionary lookup keyed by string id, falls back to the
 * Chinese source string. No library — just a function that subscribes to the
 * `language` slice of the UI store.
 *
 * Usage:
 *   const t = useT();
 *   <Button>{t("send")}</Button>
 */

import { useUI } from "@/stores/ui";

type Lang = "zh" | "en";

// English overrides; missing keys fall back to the literal `key` (which is the
// Chinese phrase). This keeps the source readable and avoids forcing every
// label to live in a dict.
const en: Record<string, string> = {
  // generic
  发送: "Send",
  取消: "Cancel",
  保存: "Save",
  删除: "Delete",
  编辑: "Edit",
  复制: "Copy",
  重生成: "Regenerate",
  关闭: "Close",
  // rail labels (titles)
  对话: "Chats",
  Agents: "Agents",
  我的身份: "My Personas",
  角色卡: "Character Cards",
  技能: "Skills",
  记忆: "Memories",
  "设置 / Providers": "Settings / Providers",
  // chat header
  "💾 沉淀为记忆": "💾 Sediment to memory",
  "总结中…": "Summarizing…",
  // conversation list
  搜索消息: "Search messages",
  新建文件夹: "New folder",
  新建对话: "New chat",
};

export function translate(key: string, lang: Lang): string {
  if (lang === "en") return en[key] ?? key;
  return key;
}

export function useT() {
  const lang = useUI((s) => s.language);
  return (key: string) => translate(key, lang);
}
