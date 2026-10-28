// Number formatting shared by the results page, Markdown report and CSV export.

export function num(x: number | null | undefined, digits = 2): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "–";
  return x.toFixed(digits);
}

export function pct(x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "–";
  return `${(x * 100).toFixed(digits)}%`;
}

export function pval(p: number | null | undefined): string {
  if (p === null || p === undefined || Number.isNaN(p)) return "–";
  if (p < 0.001) return "< .001";
  return p.toFixed(3).replace(/^0/, "");
}

export function seconds(x: number | null | undefined): string {
  if (x === null || x === undefined) return "–";
  if (x < 60) return `${x.toFixed(1)} s`;
  return `${Math.floor(x / 60)}m ${Math.round(x % 60)}s`;
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

// "p = .034" or "p < .001"
export function pText(p: number | null | undefined): string {
  const v = pval(p);
  return v.startsWith("<") ? `p ${v}` : `p = ${v}`;
}
