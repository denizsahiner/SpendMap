"use client";

import { useState, useRef, useEffect } from "react";
import { Search, Download, Sparkles, Bookmark, X } from "lucide-react";
import { downloadCsv, downloadPdf } from "@/lib/download";
import {
  Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, Legend,
} from "recharts";
import type { CardSpec } from "@/lib/agent/types";
import postcodeNames from "@/public/postcode-names.json";

const nameMap = postcodeNames as Record<string, string>;
import type {
  ConsumerMetrics,
  DiffLocationItem,
  MapType,
  Mode,
  PopulationRow,
  SpendingLocationItem,
} from "@/lib/types";

// ─── Palette ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString("en-GB");
}

const CURRENCY_KEYS = /^(tam|gdhi|tom|marketPotential|market_potential|totalSourceTAM|value)$/i;

function fmtCell(v: unknown, key?: string): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!isNaN(n) && isFinite(n)) {
    const sign = n < 0 ? "-" : "";
    const abs  = Math.abs(n);
    const isCurrency = key ? CURRENCY_KEYS.test(key) : false;
    const prefix = isCurrency ? `${sign}£` : sign;
    if (abs >= 1_000) return prefix + fmt(abs);
    if (abs !== Math.round(abs)) return prefix + abs.toLocaleString("en-GB", { maximumFractionDigits: 2 });
    return prefix + Math.round(abs).toLocaleString("en-GB");
  }
  return String(v);
}

const CURRENCY_SYMBOLS: Record<string, string> = { GBP: "£", USD: "$", EUR: "€" };

function fmtMetric(value: unknown, unit?: unknown): { display: string; unit: string } {
  const n = Number(value);
  const u = unit != null ? String(unit).trim().toUpperCase() : "";
  const symbol = CURRENCY_SYMBOLS[u];

  if (!isNaN(n) && isFinite(n)) {
    const formatted = fmt(Math.abs(n));
    const sign = n < 0 ? "-" : "";
    if (symbol) return { display: `${sign}${symbol}${formatted}`, unit: "" };
    return { display: `${sign}${formatted}`, unit: u };
  }
  return { display: String(value ?? "—"), unit: u };
}

const P = {
  coral:    "#FA8072",
  pink:     "#FFB6C1",
  blue:     "#87CEEB",
  lavender: "#DDA0DD",
  mint:     "#98D8C8",
  peach:    "#FFE5B4",
  purple:   "#B19CD9",
  cyan:     "#AFEEEE",
};

// ─── Shared primitives ────────────────────────────────────────────────────────

function CardTitle({
  children,
  district,
  dlRows,
  dlFilename,
  dlTitle,
}: {
  children: React.ReactNode;
  district?: string;
  dlRows?: Record<string, unknown>[];
  dlFilename?: string;
  dlTitle?: string;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <p className="text-sm font-semibold leading-tight text-[#e2e8f0]">{children}</p>
      <div className="flex shrink-0 items-center gap-1">
        {dlRows && <DownloadMenu filename={dlFilename ?? "spendmap"} title={dlTitle ?? String(children)} rows={dlRows} />}
        {district && (
          <span className="rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-[#8ce0c2] bg-[#0a1929] border border-[#1e3a50]">
            {district}
          </span>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-center text-[13px] text-[#9ca3af]">
        Run a search to see data
      </p>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#87CEEB] border-t-transparent" />
    </div>
  );
}

function DownloadMenu({
  filename,
  title,
  rows,
  alwaysVisible,
}: {
  filename: string;
  title: string;
  rows: Record<string, unknown>[];
  alwaysVisible?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  if (!rows.length) return null;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className={`flex h-5 w-5 items-center justify-center rounded text-[#8fa0b5] transition-opacity hover:bg-[#2a3441] hover:text-[#e2e8f0] ${alwaysVisible ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        title="Download data"
      >
        <Download className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-50 min-w-[72px] overflow-hidden rounded-lg shadow-xl" style={{ background: "var(--sm-surface)", border: "1px solid var(--sm-border)" }}>
          <button
            className="flex w-full items-center justify-center px-3 py-2 text-[11px] font-medium transition-colors"
            style={{ color: "var(--sm-fg-1)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--sm-surface-2)")}
            onMouseLeave={e => (e.currentTarget.style.background = "")}
            onClick={() => { downloadCsv(filename, rows); setOpen(false); }}
          >
            CSV
          </button>
          <button
            className="flex w-full items-center justify-center px-3 py-2 text-[11px] font-medium transition-colors"
            style={{ color: "var(--sm-fg-1)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--sm-surface-2)")}
            onMouseLeave={e => (e.currentTarget.style.background = "")}
            onClick={async () => { await downloadPdf(filename, title, rows); setOpen(false); }}
          >
            PDF
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Consumer Metrics Card ────────────────────────────────────────────────────

export function ConsumerMetricsCard({
  mode,
  consumerMetrics,
  originPopulation,
  isLoading,
  tam,
  district,
}: {
  mode: Mode;
  consumerMetrics?: ConsumerMetrics;
  originPopulation?: PopulationRow;
  isLoading?: boolean;
  tam?: number | null;
  district?: string;
}) {
  const cardTitle = mode === "origin" ? "District Population" : "Consumer Overview";
  let dlRows: Record<string, unknown>[] = [];
  if (mode === "destination" && consumerMetrics) {
    dlRows = [
      { Metric: "Total Consumers", Value: consumerMetrics.totalConsumers },
      { Metric: "Obtainable Consumers", Value: consumerMetrics.obtainableConsumers },
      { Metric: "Obtainable %", Value: consumerMetrics.totalConsumers > 0 ? `${((consumerMetrics.obtainableConsumers / consumerMetrics.totalConsumers) * 100).toFixed(1)}%` : "—" },
    ];
  } else if (mode === "origin" && originPopulation) {
    dlRows = [{ Metric: "Population", Value: originPopulation.total_population }];
    if (tam != null) dlRows.push({ Metric: "Addressable Market", Value: tam });
  }

  return (
    <div className="flex h-full flex-col p-4">
      <CardTitle district={district} dlRows={dlRows} dlFilename={`consumer-metrics-${district ?? "district"}`} dlTitle={cardTitle}>
        {cardTitle}
      </CardTitle>

      {isLoading ? (
        <Spinner />
      ) : mode === "destination" && consumerMetrics ? (
        <div className="flex flex-1 flex-col justify-center gap-3">
          <div>
            <p className="text-[12px] text-[#9ca3af]">Total Consumers</p>
            <p className="text-[22px] font-bold leading-tight text-[#f1f5f9]">
              {fmt(consumerMetrics.totalConsumers)}
            </p>
          </div>
          <div>
            <p className="text-[12px] text-[#9ca3af]">Obtainable</p>
            <p className="text-[22px] font-bold leading-tight text-[#98D8C8]">
              {fmt(consumerMetrics.obtainableConsumers)}
            </p>
            <p className="mt-0.5 text-[11px] text-[#9ca3af]">
              {consumerMetrics.totalConsumers > 0
                ? `${((consumerMetrics.obtainableConsumers / consumerMetrics.totalConsumers) * 100).toFixed(1)}% weighted`
                : "—"}
            </p>
          </div>
        </div>
      ) : mode === "origin" && originPopulation ? (
        <div className="flex flex-1 flex-col justify-center gap-3">
          <div>
            <p className="text-[12px] text-[#9ca3af]">Population</p>
            <p className="text-[26px] font-bold leading-tight text-[#87CEEB]">
              {fmt(originPopulation.total_population)}
            </p>
            <p className="mt-0.5 text-[11px] text-[#9ca3af]">
              {originPopulation.postcode} district
            </p>
          </div>
          {tam != null && (
            <div>
              <p className="text-[12px] text-[#9ca3af]">Addressable Market</p>
              <p className="text-[18px] font-bold leading-tight text-[#FFE5B4]">
                {fmt(tam)}
              </p>
            </div>
          )}
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

// ─── Market Overview Card ─────────────────────────────────────────────────────

export function MarketOverviewCard({
  mode,
  mapType,
  tom,
  totalTam,
  isLoading,
  district,
}: {
  mode: Mode;
  mapType: MapType;
  tom?: number | null;
  totalTam?: number | null;
  isLoading?: boolean;
  district?: string;
}) {
  const hasData = mapType === "standard" && mode === "destination" && tom != null;
  const penetration =
    tom != null && totalTam != null && totalTam > 0
      ? (tom / totalTam) * 100
      : null;

  const dlRows: Record<string, unknown>[] = hasData
    ? [
        ...(totalTam != null ? [{ Metric: "Total Addressable Market", Value: totalTam }] : []),
        { Metric: "Total Obtainable Market", Value: tom! },
        ...(penetration != null ? [{ Metric: "Market Penetration %", Value: `${penetration.toFixed(1)}%` }] : []),
      ]
    : [];

  return (
    <div className="flex h-full flex-col p-4">
      <CardTitle district={district} dlRows={dlRows} dlFilename={`market-overview-${district ?? "district"}`} dlTitle="Market Overview">Market Overview</CardTitle>
      {isLoading ? (
        <Spinner />
      ) : !hasData ? (
        <EmptyState />
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-3">
          {totalTam != null && (
            <div>
              <p className="text-[12px] text-[#9ca3af]">Total Addressable Market</p>
              <p className="text-[16px] font-bold leading-tight text-[#FFE5B4]">
                {fmt(totalTam)}
              </p>
            </div>
          )}
          <div>
            <p className="text-[12px] text-[#9ca3af]">Total Obtainable Market</p>
            <p className="text-[22px] font-bold leading-tight text-[#B19CD9]">
              {fmt(tom!)}
            </p>
          </div>
          {penetration != null && (
            <div>
              <p className="text-[12px] text-[#9ca3af]">Market Penetration</p>
              <p className="text-[18px] font-bold leading-tight text-[#98D8C8]">
                {penetration.toFixed(1)}%
              </p>
              <p className="mt-0.5 text-[11px] text-[#9ca3af]">TOM / TAM</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Spend Index Card ────────────────────────────────────────────────────────

export function SpendIndexCard({
  totalSpend,
  spendingDistrictCount,
  isLoading,
  district,
}: {
  totalSpend?: number | null;
  spendingDistrictCount?: number;
  isLoading?: boolean;
  district?: string;
}) {
  const hasData = totalSpend != null && totalSpend > 0;
  const avg =
    hasData && spendingDistrictCount && spendingDistrictCount > 0
      ? totalSpend! / spendingDistrictCount
      : null;

  const dlRows: Record<string, unknown>[] = hasData
    ? [
        { Metric: "Total Spend Index", Value: `${totalSpend!.toFixed(2)}%` },
        ...(spendingDistrictCount != null ? [{ Metric: "Sending Districts", Value: spendingDistrictCount }] : []),
        ...(avg != null ? [{ Metric: "Avg per District", Value: `${avg.toFixed(2)}%` }] : []),
      ]
    : [];

  return (
    <div className="flex h-full flex-col p-4">
      <CardTitle district={district} dlRows={dlRows} dlFilename={`spend-activity-${district ?? "district"}`} dlTitle="Spend Activity">Spend Activity</CardTitle>
      {isLoading ? (
        <Spinner />
      ) : !hasData ? (
        <EmptyState />
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-3">
          <div>
            <p className="text-[12px] text-[#9ca3af]">Total Spend Index</p>
            <p className="text-[22px] font-bold leading-tight text-[#FA8072]">
              {totalSpend!.toFixed(2)}%
            </p>
          </div>
          {spendingDistrictCount != null && (
            <div>
              <p className="text-[12px] text-[#9ca3af]">Sending Districts</p>
              <p className="text-[18px] font-bold leading-tight text-[#87CEEB]">
                {spendingDistrictCount}
                <span className="ml-1 text-[12px] font-normal text-[#9ca3af]">
                  postcodes
                </span>
              </p>
            </div>
          )}
          {avg != null && (
            <div>
              <p className="text-[12px] text-[#9ca3af]">Avg per District</p>
              <p className="text-[14px] font-semibold text-[#cbd5e1]">
                {avg.toFixed(2)}%
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Spend Trend Card ────────────────────────────────────────────────────────

export function SpendTrendCard({
  top3,
  isLoading,
  district,
}: {
  top3?: SpendingLocationItem[];
  isLoading?: boolean;
  district?: string;
}) {
  const districts = top3 ?? [];
  // X = time periods, each district is a separate Bar
  const chartData = [
    { period: "Last Year",    ...Object.fromEntries(districts.map((r) => [r.location, r.prev_year_spend   ?? null])) },
    { period: "Prev Quarter", ...Object.fromEntries(districts.map((r) => [r.location, r.prev_period_spend ?? null])) },
    { period: "Current",      ...Object.fromEntries(districts.map((r) => [r.location, r.spend])) },
  ];
  const districtColors = [P.mint, P.blue, P.lavender];
  const hasData = districts.length > 0;

  const dlRows: Record<string, unknown>[] = districts.map((r) => ({
    District: r.location,
    Current: r.spend.toFixed(3),
    Prev_Quarter: (r.prev_period_spend ?? 0).toFixed(3),
    Last_Year: (r.prev_year_spend ?? 0).toFixed(3),
  }));

  return (
    <div className="flex h-full flex-col p-4">
      <CardTitle district={district} dlRows={dlRows} dlFilename={`spend-trend-${district ?? "district"}`} dlTitle="Spend Trend">Spend Trend</CardTitle>
      {isLoading ? (
        <Spinner />
      ) : !hasData ? (
        <EmptyState />
      ) : (
        <div className="flex flex-1 flex-col">
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 8, left: -24, bottom: 0 }}
                barCategoryGap="24%"
                barGap={3}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3441" vertical={false} />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 10, fill: "#8fa0b5" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => v.toFixed(2)}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #2a3441", background: "#0d1522", color: "#cbd5e1" }}
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  formatter={(v) => [v != null ? Number(v).toFixed(3) : "—", ""]}
                />
                {districts.map((r, i) => (
                  <Bar
                    key={r.location}
                    dataKey={r.location}
                    fill={districtColors[i % districtColors.length]}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={20}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Legend */}
          <div className="mt-1.5 flex items-center gap-3">
            {districts.map((r, i) => (
              <div key={r.location} className="flex items-center gap-1">
                <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: districtColors[i % districtColors.length] }} />
                <span className="text-[10px] text-[#8fa0b5]">{r.location}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Top Decline Card ─────────────────────────────────────────────────────────

export function TopDeclineCard({
  topNegative,
  isLoading,
  district,
}: {
  topNegative?: DiffLocationItem[];
  isLoading?: boolean;
  district?: string;
}) {
  const rows = (topNegative ?? []).map((r) => ({
    label: r.location,
    value: Math.abs(r.spend_diff),
    sub: r.spend_diff.toFixed(2),
  }));
  const maxVal = rows.length > 0 ? Math.max(...rows.map((r) => r.value)) : 0;

  const dlRows: Record<string, unknown>[] = (topNegative ?? []).map((r) => ({
    District: r.location,
    Spend_Change: r.spend_diff.toFixed(2),
    Abs_Change: Math.abs(r.spend_diff).toFixed(2),
  }));

  return (
    <div className="flex h-full flex-col p-4">
      <CardTitle district={district} dlRows={dlRows} dlFilename={`top-decline-${district ?? "district"}`} dlTitle="Top Decline Flows">Top Decline Flows</CardTitle>
      {isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-2.5">
          {rows.map((row, i) => {
            const barPct = maxVal > 0 ? (row.value / maxVal) * 100 : 0;
            const barColor = [P.coral, P.pink, P.peach][i] ?? P.coral;
            return (
              <div key={row.label}>
                <div className="mb-1 flex items-baseline justify-between gap-1">
                  <span className="truncate text-[12px] font-semibold text-[#cbd5e1]">
                    {row.label}
                  </span>
                  <span className="shrink-0 text-[11px] text-[#FA8072]">
                    {row.sub}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#2a3441]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${barPct}%`, background: barColor }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Diff Summary Card ────────────────────────────────────────────────────────

export function DiffSummaryCard({
  diffItems,
  isLoading,
  district,
}: {
  diffItems?: DiffLocationItem[];
  isLoading?: boolean;
  district?: string;
}) {
  const gained = (diffItems ?? []).filter((d) => d.spend_diff > 0).length;
  const lost = (diffItems ?? []).filter((d) => d.spend_diff < 0).length;
  const hasData = (diffItems ?? []).length > 0;

  const dlRows: Record<string, unknown>[] = hasData
    ? [
        { Metric: "Growing Districts", Value: gained },
        { Metric: "Declining Districts", Value: lost },
        { Metric: "Net Trend", Value: gained >= lost ? "Growth" : "Decline" },
      ]
    : [];

  return (
    <div className="flex h-full flex-col p-4">
      <CardTitle district={district} dlRows={dlRows} dlFilename={`change-summary-${district ?? "district"}`} dlTitle="Change Summary">Change Summary</CardTitle>
      {isLoading ? (
        <Spinner />
      ) : !hasData ? (
        <EmptyState />
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-3">
          <div>
            <p className="text-[12px] text-[#9ca3af]">Growing Districts</p>
            <p className="text-[22px] font-bold leading-tight text-[#98D8C8]">
              {gained}
            </p>
          </div>
          <div>
            <p className="text-[12px] text-[#9ca3af]">Declining Districts</p>
            <p className="text-[18px] font-bold leading-tight text-[#FA8072]">
              {lost}
            </p>
          </div>
          <div>
            <p className="text-[12px] text-[#9ca3af]">Net Trend</p>
            <p
              className={`text-[14px] font-semibold ${
                gained >= lost ? "text-[#98D8C8]" : "text-[#FA8072]"
              }`}
            >
              {gained >= lost ? "Growth" : "Decline"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Top Flows Card ───────────────────────────────────────────────────────────

export function TopFlowsCard({
  mode,
  mapType,
  top3,
  topPositive,
  isLoading,
  district,
}: {
  mode: Mode;
  mapType: MapType;
  top3?: SpendingLocationItem[];
  topPositive?: DiffLocationItem[];
  isLoading?: boolean;
  district?: string;
}) {
  const isStandard = mapType === "standard";
  const rows: { label: string; value: number }[] = isStandard
    ? (top3 ?? []).map((r) => ({ label: r.location, value: r.spend }))
    : (topPositive ?? []).map((r) => ({ label: r.location, value: r.spend_diff }));

  const maxVal = rows.length > 0 ? Math.max(...rows.map((r) => r.value)) : 0;

  const label = isStandard
    ? mode === "origin"
      ? "Top Destinations"
      : "Top Origins"
    : "Top Growth Flows";

  const dlRows: Record<string, unknown>[] = rows.map((r) => ({
    District: r.label,
    [isStandard ? "Spend %" : "Spend Change"]: r.value.toFixed(2),
  }));

  return (
    <div className="flex h-full flex-col p-4">
      <CardTitle district={district} dlRows={dlRows} dlFilename={`${label.toLowerCase().replace(/ /g, "-")}-${district ?? "district"}`} dlTitle={label}>{label}</CardTitle>
      {isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-2.5">
          {rows.map((row, i) => {
            const barPct  = maxVal > 0 ? (row.value / maxVal) * 100 : 0;
            const barColor = [P.blue, P.mint, P.peach][i] ?? P.blue;
            return (
              <div key={row.label} className="group/row relative">
                <div className="mb-1 flex items-baseline justify-between gap-1">
                  <span className="truncate text-[12px] font-semibold text-[#cbd5e1]">
                    {row.label}
                  </span>
                  <span className="shrink-0 text-[11px] text-[#9ca3af]">
                    {row.value.toFixed(2)}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#2a3441]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${barPct}%`, background: barColor }}
                  />
                </div>
                {/* Hover tooltip */}
                <div className="pointer-events-none absolute -top-7 right-0 z-10 hidden rounded bg-[#0d1522] px-2 py-1 text-[10px] text-[#e2e8f0] shadow-lg ring-1 ring-[#2a3441] group-hover/row:block">
                  {fmt(row.value)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── All Flows Card ───────────────────────────────────────────────────────────

export function AllFlowsCard({
  items,
  mapType,
  isLoading,
}: {
  items: SpendingLocationItem[];
  mapType: MapType;
  isLoading?: boolean;
}) {
  const [search, setSearch] = useState("");
  const isDiff = mapType === "difference";

  const filtered = items.filter((item) => {
    const lower = search.toLowerCase();
    return (
      item.location.toLowerCase().includes(lower) ||
      (nameMap[item.location] ?? "").toLowerCase().includes(lower)
    );
  });

  const dlRows: Record<string, unknown>[] = items.map((item) => ({
    District: item.location,
    Name: nameMap[item.location] ?? "",
    [isDiff ? "Change" : "Spend %"]: Number(item.spend).toFixed(isDiff ? 2 : 3),
  }));

  return (
    <div className="flex h-full flex-col p-3">
      {/* Header */}
      <div className="mb-2 flex items-center gap-3">
        <p className="shrink-0 text-sm font-semibold text-[#e2e8f0]">
          {isDiff ? "All Flow Changes" : "All Flows"}
        </p>
        {items.length > 0 && (
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ca3af]" />
            <input
              type="text"
              placeholder="Search district…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded border border-[#2a3441] bg-[#0d1522] py-1 pl-7 pr-3 text-[12px] text-[#cbd5e1] placeholder:text-[#8fa0b5] focus:border-[#87CEEB] focus:outline-none"
            />
          </div>
        )}
        {items.length > 0 && (
          <span className="shrink-0 text-[11px] text-[#9ca3af]">
            {filtered.length} / {items.length}
          </span>
        )}
        {dlRows.length > 0 && (
          <DownloadMenu filename={isDiff ? "all-flow-changes" : "all-flows"} title={isDiff ? "All Flow Changes" : "All Flows"} rows={dlRows} alwaysVisible />
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#87CEEB] border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-center text-[13px] text-[#9ca3af]">Run a search to see flows</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded border border-[#2a3441]">
          <table className="w-full text-left text-[12px]">
            <thead className="sticky top-0 bg-[#0d1522] text-[10px] font-bold uppercase tracking-wider text-[#8fa0b5]">
              <tr>
                <th className="border-b border-[#2a3441] px-3 py-2">District</th>
                <th className="border-b border-[#2a3441] px-3 py-2 text-right">
                  {isDiff ? "Change" : "Spend %"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2d3d]">
              {filtered.length > 0 ? (
                filtered.map((item, i) => (
                  <tr
                    key={`${item.location}-${i}`}
                    className="transition-colors hover:bg-[#1e2d3d]"
                  >
                    <td className="px-3 py-1.5">
                      <span className="font-semibold text-[#e2e8f0]">
                        {item.location}
                      </span>
                      {nameMap[item.location] && (
                        <span className="ml-1.5 text-[11px] text-[#8fa0b5]">
                          {nameMap[item.location]}
                        </span>
                      )}
                    </td>
                    <td
                      className={`px-3 py-1.5 text-right font-semibold tabular-nums ${
                        isDiff
                          ? item.spend >= 0
                            ? "text-[#98D8C8]"
                            : "text-[#FA8072]"
                          : "text-[#cbd5e1]"
                      }`}
                    >
                      {isDiff && item.spend > 0 ? "+" : ""}
                      {Number(item.spend).toFixed(isDiff ? 2 : 3)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={2}
                    className="px-3 py-6 text-center text-[12px] italic text-[#9ca3af]"
                  >
                    No results for &ldquo;{search}&rdquo;
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Agent Card ───────────────────────────────────────────────────────────────

const AGENT_COLORS = [
  "#7aa5d1",
  "#6aa9aa",
  "#4fa67f",
  "#c48a3a",
  "#f7b8a1",
  "#94a3b8",
];

export function AgentCard({
  card,
  onSave,
  onRemove,
  isSaved,
}: {
  card: CardSpec;
  onSave?: () => void;
  onRemove?: () => void;
  isSaved?: boolean;
}) {
  const { type, title, district, data, config } = card;

  const dlRows = data && data.length > 0 ? data as Record<string, unknown>[] : [];
  const dlFilename = `agent-${title.toLowerCase().replace(/\s+/g, "-")}-${district ?? "data"}-${card.id.slice(-6)}`;

  const header = (
    <div className="card-top">
      <div className="kind"><Sparkles size={13} /></div>
      <div className="card-title-wrap">
        <h4 className="card-title">
          <span className="card-title-text">{title}</span>
          {district && <span className="code">{district}</span>}
        </h4>
        <p className="card-sub">
          <span style={{ color: "var(--sm-info-ink)", background: "var(--sm-info-soft)", border: "1px solid var(--sm-info)", borderRadius: 4, padding: "0 5px", fontSize: 9, fontWeight: 700 }}>AI</span>
          <span className="dot" />
          {type}
        </p>
      </div>
      <div className="card-actions" style={{ opacity: 1 }}>
        {dlRows.length > 0 && (
          <DownloadMenu filename={dlFilename} title={title} rows={dlRows} alwaysVisible />
        )}
        {onSave && (
          <button onClick={onSave} title="Save to library" style={{ color: isSaved ? "var(--sm-mint)" : undefined }}>
            <Bookmark size={11} />
          </button>
        )}
        {onRemove && (
          <button onClick={onRemove} title="Remove card">
            <X size={11} />
          </button>
        )}
      </div>
    </div>
  );

  if (!data || data.length === 0) {
    return (
      <div className="flex h-full flex-col p-4">
        {header}
        <EmptyState />
      </div>
    );
  }

  const tooltipStyle = {
    contentStyle: { fontSize: 11, background: "var(--sm-surface)", border: "1px solid var(--sm-border)", borderRadius: 8, color: "var(--sm-fg-1)" },
    labelStyle: { color: "var(--sm-fg-2)", marginBottom: 2 },
    itemStyle: { color: "var(--sm-mint)" },
    cursor: { fill: "rgba(128,128,128,0.06)" },
  };

  // ── Bar chart ────────────────────────────────────────────────────────────────
  if (type === "bar") {
    const xKey = config.xKey ?? "location";
    const yKey = typeof config.yKey === "string" ? config.yKey : "spend";
    const unit = config.unit ?? "";
    const isCurrency = unit.includes("£") || unit.toLowerCase().includes("gbp") || unit.toLowerCase().includes("tam") || unit.toLowerCase().includes("gdhi");

    const fmtAxisVal = (v: number): string => {
      const abs = Math.abs(v);
      const prefix = isCurrency ? "£" : "";
      if (abs >= 1e9) return prefix + (v / 1e9).toFixed(1) + "B";
      if (abs >= 1e6) return prefix + (v / 1e6).toFixed(0) + "M";
      if (abs >= 1e3) return prefix + (v / 1e3).toFixed(0) + "K";
      if (abs >= 1)   return prefix + v.toFixed(1);
      return v.toFixed(3);
    };

    const maxLabelLen = data.reduce((max, d) => Math.max(max, String(d[xKey] ?? "").length), 0);
    const yAxisWidth = Math.min(120, Math.max(48, maxLabelLen * 7));

    const BarTickTruncated = ({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) => {
      const label = payload?.value ?? "";
      const maxChars = Math.floor(yAxisWidth / 7);
      const display = label.length > maxChars ? label.slice(0, maxChars - 1) + "…" : label;
      return (
        <text x={x} y={y} dy={4} textAnchor="end" fontSize={10} fill="var(--sm-fg-3)">
          {display}
        </text>
      );
    };

    const rowHeight   = 30;
    const chartHeight = Math.max(160, data.length * rowHeight);
    const maxVisible  = 320;

    return (
      <div className="flex flex-col card-body" style={{ padding: "0 16px 14px" }}>
        {header}
        <div style={{ overflowY: "auto", maxHeight: maxVisible, flexShrink: 0 }}>
          <div style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 4, right: 8, left: 4, bottom: 0 }} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sm-border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "var(--sm-fg-3)" }} axisLine={false} tickLine={false} tickFormatter={fmtAxisVal} />
                <YAxis type="category" dataKey={xKey} tick={BarTickTruncated} axisLine={false} tickLine={false} width={yAxisWidth} interval={0} />
                <Tooltip {...tooltipStyle} formatter={(v: unknown) => [v != null ? fmtAxisVal(Number(v)) : "—", yKey]} />
                <Bar dataKey={yKey} fill={AGENT_COLORS[0]} radius={[0, 3, 3, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  // ── Line chart ───────────────────────────────────────────────────────────────
  if (type === "line") {
    const xKey  = config.xKey ?? "period";
    const yKeys = Array.isArray(config.yKey)
      ? config.yKey
      : [typeof config.yKey === "string" ? config.yKey : "totalSpend"];
    return (
      <div className="flex flex-col card-body" style={{ padding: "0 16px 14px" }}>
        {header}
        <div style={{ height: Math.max(140, data.length * 20), minHeight: 140, maxHeight: 240, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--sm-border)" vertical={false} />
              <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: "var(--sm-fg-3)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "var(--sm-fg-4)" }} axisLine={false} tickLine={false} />
              <Tooltip {...tooltipStyle} formatter={(v: unknown) => [v != null ? Number(v).toFixed(3) : "—", ""]} />
              {yKeys.map((k, i) => (
                <Line key={k} type="monotone" dataKey={k} stroke={AGENT_COLORS[i % AGENT_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              ))}
              {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // ── Age Distribution ─────────────────────────────────────────────────────────
  if (type === "age-distribution") {
    const WS_AGE_COLORS = ["#94a3b8", "#7aa5d1", "#6aa9aa", "#4fa67f", "#c48a3a", "#f7b8a1"];
    const rows  = data.map((d, i) => ({ label: String(d.name ?? ""), value: Number(d.value ?? 0), color: WS_AGE_COLORS[i % WS_AGE_COLORS.length] }));
    const total = rows.reduce((s, r) => s + r.value, 0);
    return (
      <div className="flex flex-col card-body" style={{ padding: "0 16px 14px" }}>
        {header}
        <div style={{ display: "flex", flexDirection: "column", gap: 7, paddingTop: 4 }}>
          {rows.map((r) => (
            <div key={r.label}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--sm-fg-2)", marginBottom: 3 }}>
                <span>{r.label}</span>
                <span style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--sm-fg-1)" }}>
                  {fmt(r.value)} · {total > 0 ? ((r.value / total) * 100).toFixed(0) : "0"}%
                </span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: "var(--sm-surface-3)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${total > 0 ? (r.value / total) * 100 : 0}%`, background: r.color, borderRadius: 3, transition: "width .4s" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Gender Split ─────────────────────────────────────────────────────────────
  if (type === "gender-split") {
    const female  = Number(data.find(d => String(d.name) === "Female")?.value ?? 0);
    const male    = Number(data.find(d => String(d.name) === "Male")?.value ?? 0);
    const gTotal  = female + male;
    const femPct  = gTotal > 0 ? ((female / gTotal) * 100).toFixed(1) : "0.0";
    const malPct  = gTotal > 0 ? ((male   / gTotal) * 100).toFixed(1) : "0.0";
    return (
      <div className="flex flex-col card-body" style={{ padding: "0 16px 14px" }}>
        {header}
        <div className="card-stats">
          <div className="card-stat">
            <div className="lbl">Female</div>
            <div className="val">{femPct}%</div>
            <div style={{ fontSize: 10, color: "var(--sm-fg-3)", marginTop: 2 }}>{fmt(female)}</div>
          </div>
          <div className="card-stat">
            <div className="lbl">Male</div>
            <div className="val">{malPct}%</div>
            <div style={{ fontSize: 10, color: "var(--sm-fg-3)", marginTop: 2 }}>{fmt(male)}</div>
          </div>
        </div>
        <div style={{ height: 6, borderRadius: 3, overflow: "hidden", display: "flex", marginTop: 10 }}>
          <div style={{ width: `${femPct}%`, background: "#f7b8a1", transition: "width .4s" }} />
          <div style={{ flex: 1, background: "#7aa5d1" }} />
        </div>
      </div>
    );
  }

  // ── Household Types ───────────────────────────────────────────────────────────
  if (type === "household-types") {
    const WS_HH_COLORS: Record<string, string> = { Families: "#6aa9aa", "Over 66": "#c48a3a", Students: "#7aa5d1", Working: "#4fa67f" };
    const rows  = data.map(d => ({ label: String(d.name ?? ""), value: Number(d.value ?? 0) }));
    const total = rows.reduce((s, r) => s + r.value, 0);
    return (
      <div className="flex flex-col card-body" style={{ padding: "0 16px 14px" }}>
        {header}
        <div style={{ display: "flex", flexDirection: "column", gap: 7, paddingTop: 4 }}>
          {rows.map((r) => (
            <div key={r.label}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--sm-fg-2)", marginBottom: 3 }}>
                <span>{r.label}</span>
                <span style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--sm-fg-1)" }}>
                  {fmt(r.value)} · {total > 0 ? ((r.value / total) * 100).toFixed(0) : "0"}%
                </span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: "var(--sm-surface-3)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${total > 0 ? (r.value / total) * 100 : 0}%`, background: WS_HH_COLORS[r.label] ?? "var(--sm-mint)", borderRadius: 3, transition: "width .4s" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Venue list ───────────────────────────────────────────────────────────────
  if (type === "list") {
    return (
      <div className="flex flex-col card-body" style={{ padding: "0 16px 14px" }}>
        {header}
        <div style={{ overflowY: "auto", maxHeight: 260, marginTop: 4 }}>
          {data.map((item, i) => {
            const name     = String(item.name ?? item.brand ?? "—");
            const kind     = String(item.type ?? item.category ?? "");
            const address  = item.address  ? String(item.address)  : undefined;
            const postcode = item.postcode ? String(item.postcode) : undefined;
            const sub      = [address, postcode].filter(Boolean).join(", ");
            return (
              <div key={i} className="flex items-center gap-2 py-1.5" style={{ borderBottom: "1px solid var(--sm-border)" }}>
                <span className="w-4 shrink-0 text-right text-[10px] font-bold" style={{ color: "var(--sm-fg-4)" }}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold" style={{ color: "var(--sm-ink)" }}>{name}</p>
                  {sub && <p className="truncate text-[10px]" style={{ color: "var(--sm-fg-4)" }}>{sub}</p>}
                </div>
                {kind && (
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold" style={{ color: "var(--sm-mint-ink)", background: "var(--sm-mint-soft)", border: "1px solid var(--sm-mint)" }}>
                    {kind}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Metric card ──────────────────────────────────────────────────────────────
  if (type === "metric") {
    const n = data.length;
    const valueFontSize = n <= 3 ? 18 : n <= 5 ? 14 : 12;
    const labelFontSize = n <= 5 ? 11 : 10;
    const gap = n <= 3 ? 12 : n <= 5 ? 8 : 5;
    return (
      <div className="flex flex-col card-body" style={{ padding: "0 16px 14px" }}>
        {header}
        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap, paddingTop: 4 }}>
          {data.map((d, i) => {
            const { display, unit: displayUnit } = fmtMetric(d.value, d.unit);
            return (
              <div key={i}>
                <p style={{ fontSize: labelFontSize, color: "var(--sm-fg-3)", marginBottom: 1 }}>{String(d.label ?? d.name ?? "")}</p>
                <p style={{ fontSize: valueFontSize, fontWeight: 700, lineHeight: 1.2, color: AGENT_COLORS[i % AGENT_COLORS.length] }}>
                  {display}
                  {displayUnit && <span style={{ marginLeft: 4, fontSize: labelFontSize, fontWeight: 400, color: "var(--sm-fg-3)" }}>{displayUnit}</span>}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Comparison table ──────────────────────────────────────────────────────────
  const keys = Array.isArray(config.yKey) ? config.yKey : Object.keys(data[0] ?? {}).filter((k) => k !== "district" && k !== "name");
  return (
    <div className="flex flex-col card-body" style={{ padding: "0 16px 14px" }}>
      {header}
      <div style={{ overflowY: "auto", maxHeight: 260, borderRadius: 6, border: "1px solid var(--sm-border)", marginTop: 4 }}>
        <table className="w-full text-left text-[12px]">
          <thead className="sticky top-0 text-[10px] font-bold uppercase tracking-wider" style={{ background: "var(--sm-surface)", color: "var(--sm-fg-3)" }}>
            <tr>
              <th className="px-2 py-1.5" style={{ borderBottom: "1px solid var(--sm-border)" }}>District</th>
              {keys.slice(0, 3).map((k) => (
                <th key={k} className="px-2 py-1.5 text-right" style={{ borderBottom: "1px solid var(--sm-border)" }}>{k}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--sm-border)" }}>
                <td className="px-2 py-1.5 font-semibold" style={{ color: "var(--sm-ink)" }}>
                  {String(row.district ?? row.name ?? `#${i + 1}`)}
                </td>
                {keys.slice(0, 3).map((k) => (
                  <td key={k} className="px-2 py-1.5 text-right" style={{ color: "var(--sm-fg-1)" }}>
                    {fmtCell(row[k], k)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
