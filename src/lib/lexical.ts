/**
 * Lexical scoring and rank fusion for hybrid retrieval.
 *
 * Kept free of any database or provider dependency so the ranking behaviour can
 * be reasoned about (and exercised) on its own.
 */

/** RRF damping; 60 is the value from the original Cormack et al. paper. */
export const RRF_K = 60;

/**
 * Split into scoring terms. CJK has no word delimiters, so it is indexed as
 * character bigrams; latin/digit runs are kept whole and lowercased, which is
 * what preserves identifiers like `ERR_2049` or `bge-reranker-v2-m3`.
 */
export function terms(s: string): string[] {
  const out: string[] = [];
  for (const m of s.toLowerCase().matchAll(/[a-z0-9_.+#-]+|[\u4e00-\u9fff]+/g)) {
    const tok = m[0]!;
    if (/^[\u4e00-\u9fff]+$/.test(tok)) {
      if (tok.length === 1) out.push(tok);
      for (let i = 0; i + 1 < tok.length; i++) out.push(tok.slice(i, i + 2));
    } else if (tok.length > 1) {
      out.push(tok);
    }
  }
  return out;
}

/** tf-idf over a document set, length-normalised so long chunks don't win. */
export function lexicalScores(query: string, docs: string[]): number[] {
  const qTerms = [...new Set(terms(query))];
  if (qTerms.length === 0 || docs.length === 0) return docs.map(() => 0);

  const docTerms = docs.map((d) => terms(d));
  const df = new Map<string, number>();
  for (const t of qTerms) {
    let n = 0;
    for (const dt of docTerms) if (dt.includes(t)) n++;
    df.set(t, n);
  }

  const N = docs.length;
  return docTerms.map((dt) => {
    if (dt.length === 0) return 0;
    const counts = new Map<string, number>();
    for (const t of dt) counts.set(t, (counts.get(t) ?? 0) + 1);
    let score = 0;
    for (const t of qTerms) {
      const tf = counts.get(t) ?? 0;
      if (tf === 0) continue;
      const idf = Math.log(1 + N / (1 + (df.get(t) ?? 0)));
      score += (tf / dt.length) * idf;
    }
    return score;
  });
}

/** Indices of the top-n scores, descending, dropping non-positive ones. */
export function topIndices(scores: number[], n: number): number[] {
  return scores
    .map((s, i) => [s, i] as const)
    .filter(([s]) => s > 0)
    .sort((a, b) => b[0] - a[0])
    .slice(0, n)
    .map(([, i]) => i);
}

/**
 * Reciprocal Rank Fusion: score = Σ 1/(k + rank). Being rank-based, the arms
 * need no score calibration — the reason RRF is used instead of a weighted sum
 * of cosine similarity and tf-idf, whose scales are unrelated.
 */
export function rrf(ranked: number[][]): Map<number, number> {
  const fused = new Map<number, number>();
  for (const list of ranked) {
    list.forEach((idx, rank) => {
      fused.set(idx, (fused.get(idx) ?? 0) + 1 / (RRF_K + rank + 1));
    });
  }
  return fused;
}
