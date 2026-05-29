/**
 * Minimal PNG tEXt/iTXt chunk reader for SillyTavern character cards.
 * Returns a record of keyword → string value.
 */

function crc32Skip(_: number): number { return 0; } // unused, here to keep deps zero

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function readPngTextChunks(buf: ArrayBuffer): Record<string, string> {
  void crc32Skip;
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  for (let i = 0; i < PNG_SIG.length; i++) {
    if (bytes[i] !== PNG_SIG[i]) throw new Error("Not a PNG file");
  }

  const out: Record<string, string> = {};
  let off = 8;
  while (off + 8 <= bytes.length) {
    const len = view.getUint32(off);
    const type = String.fromCharCode(
      bytes[off + 4],
      bytes[off + 5],
      bytes[off + 6],
      bytes[off + 7],
    );
    const dataStart = off + 8;
    const dataEnd = dataStart + len;
    if (dataEnd + 4 > bytes.length) break;

    if (type === "tEXt") {
      // keyword\0text  (Latin-1)
      const sub = bytes.subarray(dataStart, dataEnd);
      const zero = sub.indexOf(0);
      if (zero > 0) {
        const keyword = latin1(sub.subarray(0, zero));
        const value = latin1(sub.subarray(zero + 1));
        out[keyword] = value;
      }
    } else if (type === "iTXt") {
      // keyword\0 compression_flag\0 compression_method\0 lang\0 translated\0 text  (UTF-8)
      const sub = bytes.subarray(dataStart, dataEnd);
      let p = 0;
      const zero1 = sub.indexOf(0, p);
      if (zero1 < 0) { off = dataEnd + 4; continue; }
      const keyword = latin1(sub.subarray(p, zero1));
      p = zero1 + 1;
      const compFlag = sub[p++];
      p++; // compression method
      const zero2 = sub.indexOf(0, p);
      p = zero2 + 1; // skip lang
      const zero3 = sub.indexOf(0, p);
      p = zero3 + 1; // skip translated keyword
      const rest = sub.subarray(p);
      if (compFlag === 0) {
        out[keyword] = new TextDecoder("utf-8").decode(rest);
      }
      // compressed iTXt skipped (no zlib without deps)
    } else if (type === "IEND") {
      break;
    }

    off = dataEnd + 4; // +4 for CRC
  }
  return out;
}

function latin1(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

export interface CharacterCardV2 {
  spec: "chara_card_v2" | "chara_card_v3";
  spec_version: string;
  data: {
    name: string;
    description?: string;
    personality?: string;
    scenario?: string;
    first_mes?: string;
    mes_example?: string;
    creator_notes?: string;
    system_prompt?: string;
    post_history_instructions?: string;
    alternate_greetings?: string[];
    tags?: string[];
    creator?: string;
    character_version?: string;
    extensions?: Record<string, unknown>;
  };
}

/**
 * Parse a SillyTavern character card from a PNG ArrayBuffer.
 * Tries V3 ("ccv3") first, falls back to V2 ("chara").
 */
export function parseCharacterCardFromPng(buf: ArrayBuffer): CharacterCardV2 {
  const chunks = readPngTextChunks(buf);
  const raw = chunks["ccv3"] ?? chunks["chara"];
  if (!raw) throw new Error("PNG has no 'chara' or 'ccv3' tEXt chunk");

  let jsonText: string;
  try {
    // base64 -> bytes -> utf-8 text
    const binStr = atob(raw);
    const u8 = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) u8[i] = binStr.charCodeAt(i);
    jsonText = new TextDecoder("utf-8").decode(u8);
  } catch {
    throw new Error("Card text chunk is not valid base64");
  }

  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== "object" || !parsed.data) {
    throw new Error("Card JSON missing 'data' field (V1 cards not supported)");
  }
  return parsed as CharacterCardV2;
}
