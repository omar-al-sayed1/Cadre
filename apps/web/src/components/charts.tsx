"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Single-series charts (one hue, no legend; the card title names the series).
 * Thin marks, 4px rounded data-ends, recessive grid, text in text tokens,
 * hover tooltips, and an equivalent table for screen readers.
 */

export interface Datum {
  label: string;
  value: number | null;
}

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 };

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | null }>;
  label?: string;
  unit?: string;
}) {
  if (!active || !payload?.length || payload[0]?.value === null || payload[0]?.value === undefined)
    return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">
        {payload[0].value}
        {unit ?? ""}
      </div>
    </div>
  );
}

function SrTable({ data, caption, unit }: { data: Datum[]; caption: string; unit?: string }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <tbody>
        {data.map((d) => (
          <tr key={d.label}>
            <th scope="row">{d.label}</th>
            <td>{d.value === null ? "No data" : `${d.value}${unit ?? ""}`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ColumnChart({
  data,
  caption,
  unit,
  height = 240,
  domainMax,
}: {
  data: Datum[];
  caption: string;
  unit?: string;
  height?: number;
  domainMax?: number;
}) {
  return (
    <figure>
      <div style={{ height }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 4, left: -16, bottom: 0 }}
            barCategoryGap="28%"
          >
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
            <XAxis
              dataKey="label"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              domain={[0, domainMax ?? "auto"]}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={<ChartTooltip unit={unit} />}
            />
            <Bar dataKey="value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <SrTable data={data} caption={caption} unit={unit} />
    </figure>
  );
}

export function HorizontalBarChart({
  data,
  caption,
  unit,
  domainMax = 100,
}: {
  data: Datum[];
  caption: string;
  unit?: string;
  domainMax?: number;
}) {
  const height = Math.max(120, data.length * 34 + 24);
  return (
    <figure>
      <div style={{ height }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
            barCategoryGap="30%"
          >
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <XAxis
              type="number"
              domain={[0, domainMax]}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={110}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={<ChartTooltip unit={unit} />}
            />
            <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <SrTable data={data} caption={caption} unit={unit} />
    </figure>
  );
}

export function TrendLineChart({
  data,
  caption,
  unit,
  height = 200,
  domain = [0, 100],
}: {
  data: Datum[];
  caption: string;
  unit?: string;
  height?: number;
  domain?: [number, number];
}) {
  return (
    <figure>
      <div style={{ height }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              interval="preserveStartEnd"
            />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} domain={domain} />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
              content={<ChartTooltip unit={unit} />}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--chart-1)"
              strokeWidth={2}
              dot={{ r: 4, fill: "var(--chart-1)", stroke: "var(--card)", strokeWidth: 2 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <SrTable data={data} caption={caption} unit={unit} />
    </figure>
  );
}
