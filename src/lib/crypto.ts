/**
 * Local-only API key obfuscation.
 *
 * v0.2 ships with WebCrypto AES-GCM using a per-install key persisted in
 * localStorage. This is NOT real security against an attacker with disk
 * access — Tauri webview localStorage lives next to the SQLite file. It is
 * here so that:
 *   1. plain `cat shanhaijing.db` doesn't leak keys to over-the-shoulder.
 *   2. accidental DB sharing (zip + send) doesn't leak keys.
 *
 * Future: move key to OS keyring via tauri-plugin-stronghold or keyring.
 */

const LS_KEY = "shanhaijing.local-key";

async function getKey(): Promise<CryptoKey> {
  let raw = localStorage.getItem(LS_KEY);
  if (!raw) {
    const buf = crypto.getRandomValues(new Uint8Array(32));
    raw = btoa(String.fromCharCode(...buf));
    localStorage.setItem(LS_KEY, raw);
  }
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptSecret(plain: string): Promise<string> {
  if (!plain) return "";
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plain),
    ),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return btoa(String.fromCharCode(...out));
}

export async function decryptSecret(blob: string | null): Promise<string> {
  if (!blob) return "";
  try {
    const all = Uint8Array.from(atob(blob), (c) => c.charCodeAt(0));
    const iv = all.slice(0, 12);
    const ct = all.slice(12);
    const key = await getKey();
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch {
    return "";
  }
}
