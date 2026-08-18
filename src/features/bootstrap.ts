/**
 * First-run bootstrap: seed preset providers (disabled, no keys) so the app is
 * usable immediately.
 */

import { getDb } from "@/db";
import { createProvider, listProviders } from "@/repos/providers";
import { seedTemplates } from "@/features/seedTemplates";
import "@/features/builtinTools"; // side-effect: registers memory/skill/web agent tools
import { initMcp } from "@/features/mcpInit";

const PRESET_PROVIDERS: Array<{
  name: string;
  base_url: string;
  kind: "openai" | "anthropic" | "ollama" | "custom";
}> = [
  {
    name: "硅基流动 SiliconFlow",
    base_url: "https://api.siliconflow.cn/v1",
    kind: "openai",
  },
  {
    name: "DeepSeek",
    base_url: "https://api.deepseek.com/v1",
    kind: "openai",
  },
  {
    name: "火山方舟 Volcengine Ark",
    base_url: "https://ark.cn-beijing.volces.com/api/v3",
    kind: "openai",
  },
  {
    name: "Ollama (本机)",
    base_url: "http://localhost:11434/v1",
    kind: "ollama",
  },
];

let bootstrapPromise: Promise<void> | null = null;
let afterStartupPromise: Promise<string> | null = null;

async function runBootstrap(): Promise<void> {
  await getDb();

  const providers = await listProviders();
  if (providers.length === 0) {
    for (const p of PRESET_PROVIDERS) {
      await createProvider({
        name: p.name,
        base_url: p.base_url,
        kind: p.kind,
        api_key_encrypted: null,
        enabled: false,
      });
    }
  }

  // Seed skill / agent samples (each section no-ops if its own table is
  // non-empty, so user data is never overwritten).
  await seedTemplates();

  // Connect enabled MCP servers and register their tools (non-blocking).
  initMcp().catch(() => {});
}

/** Open the database and load data required for the first usable frame. */
export function bootstrap(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = runBootstrap().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }
  return bootstrapPromise;
}

/**
 * Provision optional built-ins after the application shell is visible.
 * A failure here must not leave the native window blank or unusable.
 */
export function initializeAfterStartup(): Promise<string> {
  if (!afterStartupPromise) {
    afterStartupPromise = (async () => {
      const [
        { registerAppManagementTools },
        { ensureSystemAssistant, ensureSystemAssistantConversation },
      ] = await Promise.all([
        import("@/features/appManagementTools"),
        import("@/features/systemAssistant"),
      ]);
      registerAppManagementTools();
      const assistantId = await ensureSystemAssistant();
      return ensureSystemAssistantConversation(assistantId);
    })().catch((error) => {
      afterStartupPromise = null;
      throw error;
    });
  }
  return afterStartupPromise;
}
