/**
 * Embedding provider resolution.
 *
 * A knowledge base carries its own embedding provider/model. Memory (which has
 * no per-item config) uses a single global embedding config stored in
 * app_settings, so semantic memory retrieval can share one embedder.
 */

import { getProvider } from "@/repos/providers";
import { decryptSecret } from "@/lib/crypto";
import { getSetting } from "@/repos/settings";

export interface EmbedProvider {
  base_url: string;
  api_key: string;
  model: string;
}

export const EMBED_PROVIDER_KEY = "embedding_provider_id";
export const EMBED_MODEL_KEY = "embedding_model";

export async function resolveEmbedProvider(
  providerId: string,
  model: string,
): Promise<EmbedProvider> {
  const provider = await getProvider(providerId);
  if (!provider) throw new Error("embedding provider 不存在");
  const api_key = await decryptSecret(provider.api_key_encrypted);
  return { base_url: provider.base_url, api_key, model };
}

/** The global memory-embedding config, or null if not configured. */
export async function getGlobalEmbeddingConfig(): Promise<EmbedProvider | null> {
  const pid = await getSetting(EMBED_PROVIDER_KEY);
  const model = await getSetting(EMBED_MODEL_KEY);
  if (!pid || !model) return null;
  try {
    return await resolveEmbedProvider(pid, model);
  } catch {
    return null;
  }
}
