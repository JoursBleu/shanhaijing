import type { Message } from "@/types/domain";

/** Group messages by variant_group_id (fallback id), preserving first-seen order. */
export function groupByVariant(messages: Message[]): Map<string, Message[]> {
  const map = new Map<string, Message[]>();
  for (const m of messages) {
    const gid = m.variant_group_id ?? m.id;
    const arr = map.get(gid);
    if (arr) arr.push(m);
    else map.set(gid, [m]);
  }
  return map;
}

/**
 * For each variant group, pick the active message — caller-provided override
 * via `activeByGroup`, otherwise the message with the largest variant_index.
 * Output preserves the order in which groups first appeared in `messages`.
 */
export function pickActiveVariants(
  messages: Message[],
  activeByGroup: Record<string, string> = {},
): Message[] {
  const groups = groupByVariant(messages);
  const out: Message[] = [];
  for (const [gid, arr] of groups) {
    const chosenId = activeByGroup[gid];
    const chosen =
      (chosenId && arr.find((m) => m.id === chosenId)) ||
      arr.reduce((a, b) => (a.variant_index >= b.variant_index ? a : b));
    out.push(chosen);
  }
  return out;
}
