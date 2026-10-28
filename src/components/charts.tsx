"use client";
// Charts for the results page. Palette: reference data-viz palette (slot 1 blue,
// slot 2 orange), recessive grid, thin bars with rounded data-ends, hover tooltips.
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const SERIES_1 = "#2a78d6";
export const SERIES_2 = "#eb6834";
const GRID = "#e7e6e1";
const TEXT_MUTED = "#6b6b66";
const TEXT_PRIMARY = "#1c1c1a";

const tooltipStyle = {
  contentStyle: { borderRadius: 8, border: "1px solid #e4e4df", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.06)" },
  labelStyle: { color: TEXT_PRIMARY, fontWeight: 600 },
  itemStyle: { color: TEXT_PRIMARY },
  cursor: { fill: "rgba(0,0,0,0.04)" },
};

export function ColumnChart({ data, format = (v) => String(v), height = 220, name = "Value" }: { data: { label: string; value: number }[]; format?: (v: number) => string; height?: number; name?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: TEXT_MUTED, fontSize: 12 }} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: TEXT_MUTED, fontSize: 12 }} />
        <Tooltip {...tooltipStyle} formatter={(v) => [format(Number(v)), name]} />
        <Bar dataKey="value" name={name} fill={SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={56}>
          <LabelList dataKey="value" position="top" formatter={(v) => format(Number(v))} style={{ fill: TEXT_PRIMARY, fontSize: 12 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HBarChart({
  data,
  format = (v) => String(v),
  domain,
  name = "Value",
}: {
  data: { label: string; value: number }[];
  format?: (v: number) => string;
  domain?: [number, number];
  name?: string;
}) {
  const height = Math.max(120, data.length * 34 + 30);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" domain={domain ?? [0, "auto"]} tickLine={false} axisLine={false} tick={{ fill: TEXT_MUTED, fontSize: 11 }} tickFormatter={(v) => format(Number(v))} />
        <YAxis type="category" dataKey="label" width={170} tickLine={false} axisLine={false} tick={{ fill: TEXT_PRIMARY, fontSize: 12 }} />
        <Tooltip {...tooltipStyle} formatter={(v) => [format(Number(v)), name]} />
        <Bar dataKey="value" name={name} fill={SERIES_1} radius={[0, 4, 4, 0]} barSize={16}>
          <LabelList dataKey="value" position="right" formatter={(v) => format(Number(v))} style={{ fill: TEXT_PRIMARY, fontSize: 12 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PairedHBarChart({
  data,
  aLabel,
  bLabel,
  format = (v) => String(v),
  domain,
}: {
  data: { label: string; a: number; b: number }[];
  aLabel: string;
  bLabel: string;
  format?: (v: number) => string;
  domain?: [number, number];
}) {
  const height = Math.max(160, data.length * 46 + 50);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }} barGap={2}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" domain={domain ?? [0, "auto"]} tickLine={false} axisLine={false} tick={{ fill: TEXT_MUTED, fontSize: 11 }} tickFormatter={(v) => format(Number(v))} />
        <YAxis type="category" dataKey="label" width={200} tickLine={false} axisLine={false} tick={{ fill: TEXT_PRIMARY, fontSize: 12 }} />
        <Tooltip {...tooltipStyle} formatter={(v, n) => [format(Number(v)), n]} />
        <Legend verticalAlign="top" align="left" iconType="square" wrapperStyle={{ fontSize: 12, color: TEXT_MUTED, paddingBottom: 8 }} />
        <Bar dataKey="a" name={aLabel} fill={SERIES_1} radius={[0, 4, 4, 0]} barSize={12} />
        <Bar dataKey="b" name={bLabel} fill={SERIES_2} radius={[0, 4, 4, 0]} barSize={12} />
      </BarChart>
    </ResponsiveContainer>
  );
}
