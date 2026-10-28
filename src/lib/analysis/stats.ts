// Descriptive and inferential statistics used in the results report.
// Implemented here (rather than pulled from a package) so every number in the
// thesis can be traced to code that is part of the project.

export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

export function mean(xs: number[]): number | null {
  return xs.length ? sum(xs) / xs.length : null;
}

export function variance(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = sum(xs) / xs.length;
  return sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1);
}

export function sd(xs: number[]): number | null {
  const v = variance(xs);
  return v === null ? null : Math.sqrt(v);
}

export function quantile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function median(xs: number[]): number | null {
  return quantile(xs, 0.5);
}

export interface Summary {
  n: number;
  mean: number | null;
  sd: number | null;
  median: number | null;
  q1: number | null;
  q3: number | null;
  min: number | null;
  max: number | null;
}

export function summarise(xs: number[]): Summary {
  return {
    n: xs.length,
    mean: mean(xs),
    sd: sd(xs),
    median: median(xs),
    q1: quantile(xs, 0.25),
    q3: quantile(xs, 0.75),
    min: xs.length ? Math.min(...xs) : null,
    max: xs.length ? Math.max(...xs) : null,
  };
}

export function coefficientOfVariation(xs: number[]): number | null {
  const m = mean(xs);
  const s = sd(xs);
  if (m === null || s === null || m === 0) return null;
  return s / m;
}

// Deterministic PRNG so masking and bootstrap results are reproducible.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function bootstrapMeanCI(
  xs: number[],
  { iterations = 5000, level = 0.95, seed = 4093 } = {},
): [number, number] | null {
  if (xs.length < 2) return null;
  const rand = mulberry32(seed);
  const means: number[] = [];
  for (let i = 0; i < iterations; i++) {
    let total = 0;
    for (let j = 0; j < xs.length; j++) total += xs[Math.floor(rand() * xs.length)];
    means.push(total / xs.length);
  }
  const alpha = (1 - level) / 2;
  return [quantile(means, alpha)!, quantile(means, 1 - alpha)!];
}

// ---------------------------------------------------------------------------
// Distributions
// ---------------------------------------------------------------------------

// Abramowitz & Stegun 7.1.26
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

export function twoSidedNormalP(z: number): number {
  return Math.min(1, 2 * (1 - normalCdf(Math.abs(z))));
}

function logGamma(x: number): number {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
    0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (const coef of c) ser += coef / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function betacf(a: number, b: number, x: number): number {
  const maxIter = 200;
  const eps = 3e-14;
  const fpmin = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < fpmin) d = fpmin;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < eps) break;
  }
  return h;
}

function incompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

export function twoSidedTP(t: number, df: number): number {
  const x = df / (df + t * t);
  return Math.min(1, incompleteBeta(df / 2, 0.5, x));
}

// ---------------------------------------------------------------------------
// Ranks and tests
// ---------------------------------------------------------------------------

export function ranks(xs: number[]): number[] {
  const order = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const result = new Array<number>(xs.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) result[order[k][1]] = avg;
    i = j + 1;
  }
  return result;
}

export function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const mx = mean(xs)!;
  const my = mean(ys)!;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

export interface Correlation {
  n: number;
  rho: number | null;
  p: number | null;
}

export function spearman(xs: number[], ys: number[]): Correlation {
  const n = xs.length;
  const rho = pearson(ranks(xs), ranks(ys));
  if (rho === null) return { n, rho: null, p: null };
  if (Math.abs(rho) >= 1) return { n, rho, p: 0 };
  const t = rho * Math.sqrt((n - 2) / (1 - rho * rho));
  return { n, rho, p: twoSidedTP(t, n - 2) };
}

export interface TestResult {
  n: number;
  statistic: number | null;
  z: number | null;
  p: number | null;
  effect: number | null;
  note?: string;
}

// Wilcoxon signed-rank test for paired samples (normal approximation with tie
// and continuity correction; zero differences dropped). Reports T = min(W+, W-)
// and effect size r = z / sqrt(n).
export function wilcoxonSignedRank(a: number[], b: number[]): TestResult {
  const diffs = a.map((x, i) => x - b[i]).filter((d) => d !== 0);
  const n = diffs.length;
  if (n < 1) return { n, statistic: null, z: null, p: null, effect: null, note: "no non-zero differences" };
  const r = ranks(diffs.map(Math.abs));
  let wPlus = 0;
  diffs.forEach((d, i) => {
    if (d > 0) wPlus += r[i];
  });
  const meanW = (n * (n + 1)) / 4;
  const counts = new Map<number, number>();
  for (const value of r) counts.set(value, (counts.get(value) ?? 0) + 1);
  let tieAdj = 0;
  for (const t of counts.values()) tieAdj += t ** 3 - t;
  const varW = (n * (n + 1) * (2 * n + 1)) / 24 - tieAdj / 48;
  if (varW <= 0) return { n, statistic: wPlus, z: null, p: null, effect: null };
  const z = (wPlus - meanW - Math.sign(wPlus - meanW) * 0.5) / Math.sqrt(varW);
  return {
    n,
    statistic: Math.min(wPlus, (n * (n + 1)) / 2 - wPlus),
    z,
    p: twoSidedNormalP(z),
    effect: z / Math.sqrt(n),
    note: n < 10 ? "small sample: normal approximation is rough" : undefined,
  };
}

// Mann-Whitney U test for two independent samples (normal approximation with
// tie correction). Effect size r = z / sqrt(n1 + n2).
export function mannWhitneyU(a: number[], b: number[]): TestResult {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 === 0 || n2 === 0) return { n: n1 + n2, statistic: null, z: null, p: null, effect: null };
  const all = [...a, ...b];
  const r = ranks(all);
  const r1 = sum(r.slice(0, n1));
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const u = Math.min(u1, n1 * n2 - u1);
  const n = n1 + n2;
  const counts = new Map<number, number>();
  for (const value of r) counts.set(value, (counts.get(value) ?? 0) + 1);
  let tieAdj = 0;
  for (const t of counts.values()) tieAdj += t ** 3 - t;
  const varU = ((n1 * n2) / 12) * (n + 1 - tieAdj / (n * (n - 1)));
  if (varU <= 0) return { n, statistic: u, z: null, p: null, effect: null };
  const z = (u1 - (n1 * n2) / 2) / Math.sqrt(varU);
  return {
    n,
    statistic: u,
    z,
    p: twoSidedNormalP(z),
    effect: z / Math.sqrt(n),
    note: n1 < 8 || n2 < 8 ? "small groups: normal approximation is rough" : undefined,
  };
}

// Exact McNemar test on discordant pairs for paired binary outcomes.
export function mcNemarExact(a: boolean[], b: boolean[]): TestResult {
  let onlyA = 0;
  let onlyB = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] && !b[i]) onlyA++;
    if (!a[i] && b[i]) onlyB++;
  }
  const n = onlyA + onlyB;
  if (n === 0) return { n: a.length, statistic: 0, z: null, p: 1, effect: 0 };
  const k = Math.min(onlyA, onlyB);
  let tail = 0;
  let logC = 0;
  for (let i = 0; i <= k; i++) {
    if (i > 0) logC += Math.log(n - i + 1) - Math.log(i);
    tail += Math.exp(logC - n * Math.LN2);
  }
  return { n: a.length, statistic: onlyA - onlyB, z: null, p: Math.min(1, 2 * tail), effect: (onlyA - onlyB) / a.length };
}

export function cohensD(a: number[], b: number[]): number | null {
  const va = variance(a);
  const vb = variance(b);
  if (va === null || vb === null) return null;
  const pooled = Math.sqrt(((a.length - 1) * va + (b.length - 1) * vb) / (a.length + b.length - 2));
  if (pooled === 0) return null;
  return (mean(a)! - mean(b)!) / pooled;
}

// Paired effect size d_z = mean(diff) / sd(diff)
export function cohensDz(a: number[], b: number[]): number | null {
  const diffs = a.map((x, i) => x - b[i]);
  const s = sd(diffs);
  if (s === null || s === 0) return null;
  return mean(diffs)! / s;
}

// ---------------------------------------------------------------------------
// Inter-rater agreement for ordinal 0..k scores
// ---------------------------------------------------------------------------

export interface Agreement {
  n: number;
  exact: number | null;
  withinOne: number | null;
  kappa: number | null;
  weightedKappa: number | null;
}

export function agreement(a: number[], b: number[], categories = [0, 1, 2, 3]): Agreement {
  const n = a.length;
  if (n === 0 || n !== b.length) return { n, exact: null, withinOne: null, kappa: null, weightedKappa: null };
  const k = categories.length;
  const index = new Map(categories.map((c, i) => [c, i]));
  const observed = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let i = 0; i < n; i++) observed[index.get(a[i])!][index.get(b[i])!] += 1;
  const rowTotals = observed.map((row) => sum(row));
  const colTotals = categories.map((_, j) => sum(observed.map((row) => row[j])));

  let po = 0;
  let pe = 0;
  let wObs = 0;
  let wExp = 0;
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const o = observed[i][j] / n;
      const e = (rowTotals[i] * colTotals[j]) / (n * n);
      if (i === j) {
        po += o;
        pe += e;
      }
      const w = ((i - j) / (k - 1)) ** 2;
      wObs += w * o;
      wExp += w * e;
    }
  }
  const within = a.filter((x, i) => Math.abs(x - b[i]) <= 1).length / n;
  return {
    n,
    exact: po,
    withinOne: within,
    kappa: pe === 1 ? null : (po - pe) / (1 - pe),
    weightedKappa: wExp === 0 ? null : 1 - wObs / wExp,
  };
}

// Normalised Shannon entropy (1 = perfectly even) and Gini coefficient for
// how evenly the messages were spread across speakers.
export function normalisedEntropy(counts: number[]): number | null {
  const total = sum(counts);
  if (total === 0 || counts.length < 2) return null;
  let h = 0;
  for (const c of counts) if (c > 0) h -= (c / total) * Math.log(c / total);
  return h / Math.log(counts.length);
}

export function gini(counts: number[]): number | null {
  const n = counts.length;
  const total = sum(counts);
  if (n === 0 || total === 0) return null;
  let diffSum = 0;
  for (const a of counts) for (const b of counts) diffSum += Math.abs(a - b);
  return diffSum / (2 * n * n * (total / n));
}

// Regularised lower incomplete gamma P(a, x) (Numerical Recipes gammp).
function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let ap = a;
    let del = 1 / a;
    let total = del;
    for (let n = 0; n < 500; n++) {
      ap++;
      del *= x / ap;
      total += del;
      if (Math.abs(del) < Math.abs(total) * 3e-14) break;
    }
    return total * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  let b = x + 1 - a;
  let c = 1 / 1e-300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-14) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

export function chiSquareP(x: number, df: number): number {
  return Math.max(0, Math.min(1, 1 - gammaP(df / 2, x / 2)));
}

// Kruskal-Wallis H test across k independent groups (tie-corrected).
// Effect size epsilon-squared = H / (n - 1).
export function kruskalWallis(groups: number[][]): TestResult & { df: number } {
  const nonEmpty = groups.filter((g) => g.length > 0);
  const all = nonEmpty.flat();
  const n = all.length;
  const k = nonEmpty.length;
  if (k < 2 || n < 3) return { n, statistic: null, z: null, p: null, effect: null, df: Math.max(0, k - 1) };
  const r = ranks(all);
  let offset = 0;
  let h = 0;
  for (const g of nonEmpty) {
    const rankSum = sum(r.slice(offset, offset + g.length));
    h += (rankSum * rankSum) / g.length;
    offset += g.length;
  }
  h = (12 / (n * (n + 1))) * h - 3 * (n + 1);
  const counts = new Map<number, number>();
  for (const value of r) counts.set(value, (counts.get(value) ?? 0) + 1);
  let tieAdj = 0;
  for (const t of counts.values()) tieAdj += t ** 3 - t;
  const correction = 1 - tieAdj / (n ** 3 - n);
  if (correction <= 0) return { n, statistic: null, z: null, p: null, effect: null, df: k - 1 };
  h /= correction;
  return { n, statistic: h, z: null, p: chiSquareP(h, k - 1), effect: h / (n - 1), df: k - 1 };
}
