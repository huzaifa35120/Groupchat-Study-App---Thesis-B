// Automatic similarity metrics between an original message (reference) and the
// AI-written replacement (hypothesis). All scores are on a 0-1 scale.

import { tokenize, wordCount } from "./features";

export interface SimilarityMetrics {
  exactMatch: number;
  tokenF1: number;
  bleu: number;
  rougeL: number;
  chrF: number;
  editSimilarity: number;
  jaccard: number;
  origWords: number;
  predWords: number;
  lengthRatio: number;
}

export const METRIC_INFO: { key: keyof SimilarityMetrics; label: string; description: string }[] = [
  { key: "exactMatch", label: "Exact match", description: "Identical after lowercasing and removing punctuation" },
  { key: "tokenF1", label: "Token F1", description: "Harmonic mean of word-overlap precision and recall" },
  { key: "bleu", label: "BLEU", description: "Sentence BLEU-4 with exponential smoothing and effective order" },
  { key: "rougeL", label: "ROUGE-L", description: "F1 over the longest common word subsequence" },
  { key: "chrF", label: "chrF", description: "Character n-gram F-score (n = 1-6, beta = 2)" },
  { key: "editSimilarity", label: "Edit similarity", description: "1 - normalised Levenshtein distance over characters" },
  { key: "jaccard", label: "Jaccard", description: "Overlap of the two word sets" },
];

function normalise(text: string): string {
  return tokenize(text).join(" ");
}

function ngrams(tokens: string[], n: number): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i + n <= tokens.length; i++) {
    const key = tokens.slice(i, i + n).join("\u0001");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function overlap(a: Map<string, number>, b: Map<string, number>): number {
  let total = 0;
  for (const [key, count] of a) total += Math.min(count, b.get(key) ?? 0);
  return total;
}

export function tokenF1(reference: string, hypothesis: string): number {
  const ref = tokenize(reference);
  const hyp = tokenize(hypothesis);
  if (ref.length === 0 && hyp.length === 0) return 1;
  if (ref.length === 0 || hyp.length === 0) return 0;
  const common = overlap(ngrams(hyp, 1), ngrams(ref, 1));
  if (common === 0) return 0;
  const precision = common / hyp.length;
  const recall = common / ref.length;
  return (2 * precision * recall) / (precision + recall);
}

// Sentence-level BLEU following sacreBLEU's defaults for single sentences:
// exponential smoothing and "effective order" so that very short messages are
// not scored zero just because they contain no 4-grams.
export function bleu(reference: string, hypothesis: string, maxOrder = 4): number {
  const ref = tokenize(reference);
  const hyp = tokenize(hypothesis);
  if (hyp.length === 0 || ref.length === 0) return ref.length === hyp.length ? 1 : 0;
  let logSum = 0;
  let orders = 0;
  let smoothing = 1;
  for (let n = 1; n <= maxOrder; n++) {
    const total = Math.max(0, hyp.length - n + 1);
    if (total === 0) break;
    const matches = overlap(ngrams(hyp, n), ngrams(ref, n));
    let precision: number;
    if (matches === 0) {
      smoothing *= 2;
      precision = 1 / (smoothing * total);
    } else {
      precision = matches / total;
    }
    logSum += Math.log(precision);
    orders++;
  }
  const brevity = hyp.length >= ref.length ? 1 : Math.exp(1 - ref.length / hyp.length);
  return brevity * Math.exp(logSum / orders);
}

function lcsLength(a: string[], b: string[]): number {
  const prev = new Array(b.length + 1).fill(0);
  const curr = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

export function rougeL(reference: string, hypothesis: string): number {
  const ref = tokenize(reference);
  const hyp = tokenize(hypothesis);
  if (ref.length === 0 && hyp.length === 0) return 1;
  if (ref.length === 0 || hyp.length === 0) return 0;
  const lcs = lcsLength(ref, hyp);
  if (lcs === 0) return 0;
  const precision = lcs / hyp.length;
  const recall = lcs / ref.length;
  return (2 * precision * recall) / (precision + recall);
}

function charNgrams(chars: string[], n: number): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i + n <= chars.length; i++) {
    const key = chars.slice(i, i + n).join("");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

// chrF (Popović, 2015): character n-grams with whitespace removed, beta = 2.
export function chrF(reference: string, hypothesis: string, maxOrder = 6, beta = 2): number {
  const ref = Array.from(reference.toLowerCase().replace(/\s+/g, ""));
  const hyp = Array.from(hypothesis.toLowerCase().replace(/\s+/g, ""));
  if (ref.length === 0 && hyp.length === 0) return 1;
  if (ref.length === 0 || hyp.length === 0) return 0;
  let precisionSum = 0;
  let recallSum = 0;
  let orders = 0;
  for (let n = 1; n <= maxOrder; n++) {
    if (hyp.length < n || ref.length < n) break;
    const hypGrams = charNgrams(hyp, n);
    const refGrams = charNgrams(ref, n);
    const matches = overlap(hypGrams, refGrams);
    precisionSum += matches / (hyp.length - n + 1);
    recallSum += matches / (ref.length - n + 1);
    orders++;
  }
  if (orders === 0) return 0;
  const p = precisionSum / orders;
  const r = recallSum / orders;
  if (p === 0 && r === 0) return 0;
  const b2 = beta * beta;
  return ((1 + b2) * p * r) / (b2 * p + r);
}

export function levenshtein(a: string, b: string): number {
  const s = Array.from(a);
  const t = Array.from(b);
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const curr = [i];
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[t.length];
}

export function editSimilarity(reference: string, hypothesis: string): number {
  const a = reference.trim().toLowerCase();
  const b = hypothesis.trim().toLowerCase();
  const longest = Math.max(Array.from(a).length, Array.from(b).length);
  if (longest === 0) return 1;
  return 1 - levenshtein(a, b) / longest;
}

export function jaccard(reference: string, hypothesis: string): number {
  const a = new Set(tokenize(reference));
  const b = new Set(tokenize(hypothesis));
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const token of a) if (b.has(token)) inter++;
  return inter / (a.size + b.size - inter);
}

export function computeSimilarity(original: string, predicted: string): SimilarityMetrics {
  const origWords = wordCount(original);
  const predWords = wordCount(predicted);
  return {
    exactMatch: normalise(original) === normalise(predicted) ? 1 : 0,
    tokenF1: tokenF1(original, predicted),
    bleu: bleu(original, predicted),
    rougeL: rougeL(original, predicted),
    chrF: chrF(original, predicted),
    editSimilarity: editSimilarity(original, predicted),
    jaccard: jaccard(original, predicted),
    origWords,
    predWords,
    lengthRatio: origWords === 0 ? (predWords === 0 ? 1 : predWords) : predWords / origWords,
  };
}
