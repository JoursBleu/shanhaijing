/**
 * First-run bootstrap: seed preset providers (disabled, no keys) and a
 * default user persona so the app is usable immediately.
 */

import { getDb } from "@/db";
import { createProvider, listProviders } from "@/repos/providers";
import { createPersona, listPersonas } from "@/repos/personas";
import { seedTemplates } from "@/features/seedTemplates";

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

export async function bootstrap(): Promise<void> {
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

  const personas = await listPersonas();
  if (personas.length === 0) {
    await createPersona({
      name: "我",
      bio: "",
    });
  }

  // Seed skill / card / agent / conversation samples (each section no-ops
  // if its own table is non-empty, so user data is never overwritten).
  await seedTemplates();
}
