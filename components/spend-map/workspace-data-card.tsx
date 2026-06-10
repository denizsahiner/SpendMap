"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { downloadCsv, downloadPdf } from "@/lib/download";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  BarChart2,
  Sparkles,
  Pin,
  Bookmark,
  Download,
  Trash2,
  Search,
  TrendingUp,
  Users,
  Home,
  BarChart3,
  List,
} from "lucide-react";
import type {
  Mode,
  MapType,
  SpendingLocationItem,
  HouseholdMetrics,
  ConsumerMetrics,
  DiffLocationItem,
  HouseholdFilter,
} from "@/lib/types";
import type { CardSpec } from "@/lib/agent/types";
import postcodeNames from "@/public/postcode-names.json";

const nameMap = postcodeNames as Record<string, string>;

// ── Data model ────────────────────────────────────────────────────────────────

export interface WorkspaceCard {
  id: string;
  source: "manual" | "ai";
  district: string;
  districtLabel: string;
  year: number;
  quarter: string;
  mode: Mode;
  mapType: MapType;
  prompt?: string;
  createdAt: number;
  totalSpend: number | null;
  top3: SpendingLocationItem[];
  spendingItemCount: number;
  allItems: SpendingLocationItem[];
  tam: number | null;
  tom: number | null;
  population: number | null;
  householdMetrics: HouseholdMetrics | null;
  consumerMetrics: ConsumerMetrics | null;
  originPopBreakdown?: {
    age_0_15: number;
    age_16_24: number;
    age_25_34: number;
    age_35_49: number;
    age_50_64: number;
    over_65: number;
    female: number;
    male: number;
  } | null;
  topPositive?: DiffLocationItem[];
  topNegative?: DiffLocationItem[];
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmt(v: number | null): string {
  if (v === null) return "—";
  if (Math.abs(v) >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + "B";
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(1) + "K";
  return v.toFixed(1);
}
function pct(a: number, total: number): string {
  return total > 0 ? ((a / total) * 100).toFixed(0) + "%" : "—";
}

// ── Shared card shell ─────────────────────────────────────────────────────────

interface ShellProps {
  card: WorkspaceCard;
  active?: boolean;
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onPin: (c: WorkspaceCard) => void;
  onRemove?: (id: string) => void;
  onExport?: (c: WorkspaceCard) => void;
  onSave?: () => void;
  downloadRows?: Record<string, unknown>[];
  downloadTitle?: string;
}

function CardShell({
  card,
  active,
  label,
  icon,
  children,
  onPin,
  onRemove,
  onSave,
  downloadRows,
  downloadTitle,
}: ShellProps) {
  const isAI = card.source === "ai";
  const shortName = card.districtLabel.split("·")[0].trim();
  const [dlOpen, setDlOpen] = useState(false);
  const dlRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dlOpen) return;
    const handler = (e: MouseEvent) => {
      if (dlRef.current && !dlRef.current.contains(e.target as Node))
        setDlOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dlOpen]);

  const fileSlug = `spendmap-${card.district}-${card.year}${card.quarter}-${card.mode}-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className={`data-card ${card.source}${active ? " active" : ""}`}>
      <div className="card-top">
        <div className="kind">{icon}</div>
        <div className="card-title-wrap">
          <h4 className="card-title">
            {label}&nbsp;<span className="code">{card.district}</span>
          </h4>
          <div className="card-sub">
            <span style={{ fontSize: 10, color: "var(--sm-fg-4)" }}>
              {shortName}
            </span>
            <span className="dot" />
            <span>
              {card.year} {card.quarter}
            </span>
          </div>
        </div>
        <div className="card-actions" onClick={(e) => e.stopPropagation()}>
          <button title="Pin to map" onClick={() => onPin(card)}>
            <Pin size={13} />
          </button>
          {onSave && (
            <button title="Save to library" onClick={onSave}>
              <Bookmark size={13} />
            </button>
          )}
          {downloadRows && downloadRows.length > 0 && (
            <div ref={dlRef} style={{ position: "relative" }}>
              <button
                title="Download"
                onClick={(e) => {
                  e.stopPropagation();
                  setDlOpen((o) => !o);
                }}
              >
                <Download size={13} />
              </button>
              {dlOpen && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 4px)",
                    zIndex: 50,
                    background: "var(--sm-surface)",
                    border: "1px solid var(--sm-border-strong)",
                    borderRadius: 8,
                    overflow: "hidden",
                    minWidth: 68,
                    boxShadow: "0 4px 16px rgba(0,0,0,.18)",
                  }}
                >
                  {[
                    {
                      label: "CSV",
                      action: () => {
                        downloadCsv(fileSlug, downloadRows);
                        setDlOpen(false);
                      },
                    },
                    {
                      label: "PDF",
                      action: async () => {
                        await downloadPdf(
                          fileSlug,
                          downloadTitle ?? label,
                          downloadRows,
                        );
                        setDlOpen(false);
                      },
                    },
                  ].map(({ label: l, action }) => (
                    <button
                      key={l}
                      onClick={(e) => {
                        e.stopPropagation();
                        action();
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "7px 14px",
                        fontSize: 11,
                        fontWeight: 600,
                        textAlign: "center",
                        color: "var(--sm-fg-1)",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        borderBottom:
                          l === "CSV" ? "1px solid var(--sm-border)" : "none",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          "var(--sm-surface-2)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      {l}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {onRemove && (
            <button title="Remove group" onClick={() => onRemove(card.id)}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {isAI && card.prompt && (
        <div className="ai-prompt">
          <Sparkles size={12} style={{ flexShrink: 0, marginTop: 1 }} />
          <span className="q">&ldquo;{card.prompt}&rdquo;</span>
        </div>
      )}

      <div className="card-body">{children}</div>

      <div className="card-foot">
        <span style={{ fontFamily: "monospace", fontSize: 10 }}>
          {card.id.slice(0, 8)}
        </span>
        <span>
          {isAI ? "Analyst" : "Manual"} ·{" "}
          {card.mode === "origin" ? "Outflow" : "Inflow"}
        </span>
      </div>
    </div>
  );
}

// ── Shared action props ───────────────────────────────────────────────────────

interface Actions {
  active?: boolean;
  onPin: (c: WorkspaceCard) => void;
  onRemove: (id: string) => void;
  onExport: (c: WorkspaceCard) => void;
  onSave?: () => void;
}

// ── 1. Spend Summary card ─────────────────────────────────────────────────────

export function CardSpendSummary({
  card,
  ...a
}: { card: WorkspaceCard } & Actions) {
  const isDiff = card.mapType === "difference";
  const cm = card.consumerMetrics;

  const dlRows = [
    {
      district: card.district,
      period: `${card.year} ${card.quarter}`,
      mode: card.mode,
      total_spend: card.totalSpend ?? 0,
      districts: card.spendingItemCount,
      population: card.population ?? 0,
      tam: card.tam ?? 0,
      tom: card.tom ?? 0,
    },
  ];

  return (
    <CardShell
      card={card}
      label="Spend summary"
      icon={<BarChart2 size={14} />}
      downloadRows={dlRows}
      downloadTitle={`Spend Summary · ${card.district}`}
      {...a}
    >
      <div className="card-stats">
        <div className="card-stat">
          <div className="lbl">Districts</div>
          <div className="val">{card.spendingItemCount}</div>
        </div>
        <div className="card-stat">
          <div className="lbl">
            {card.mode === "origin" ? "Local" : "Obtainable"}
          </div>
          <div className="val small">
            {card.mode === "origin"
              ? fmt(card.population)
              : cm
                ? fmt(cm.obtainableConsumers)
                : "—"}
          </div>
          {card.mode === "destination" && <div className="unit">people</div>}
        </div>
        <div className="card-stat">
          <div className="lbl">{card.mode === "origin" ? "TAM" : "TOM"}</div>
          <div className="val small">
            £{card.mode === "origin" ? fmt(card.tam) : fmt(card.tom)}
          </div>
        </div>
      </div>

      {!isDiff && card.totalSpend != null && card.spendingItemCount > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginTop: 4,
            fontSize: 11,
            color: "var(--sm-fg-3)",
          }}
        >
          <span>Avg / district</span>
          <span>
            <span
              style={{
                fontFamily: "monospace",
                fontWeight: 700,
                color: "var(--sm-fg-1)",
              }}
            >
              {(card.totalSpend / card.spendingItemCount).toFixed(3)}
            </span>{" "}
            <span style={{ fontSize: 10 }}>idx/district</span>
          </span>
        </div>
      )}
    </CardShell>
  );
}

// ── 2. Spend Trend card ───────────────────────────────────────────────────────

const TREND_COLORS = ["#6aa9aa", "#7aa5d1", "#94a3b8"];

export function CardSpendTrend({
  card,
  ...a
}: { card: WorkspaceCard } & Actions) {
  if (!card.top3.length) return null;

  const chartData = [
    {
      period: "Last Year",
      ...Object.fromEntries(
        card.top3.map((r) => [r.location, r.prev_year_spend ?? null]),
      ),
    },
    {
      period: "Prev Quarter",
      ...Object.fromEntries(
        card.top3.map((r) => [r.location, r.prev_period_spend ?? null]),
      ),
    },
    {
      period: "Current",
      ...Object.fromEntries(card.top3.map((r) => [r.location, r.spend])),
    },
  ];

  const dlRows = card.top3.map((r) => ({
    location: r.location,
    name: nameMap[r.location] ?? "",
    current: r.spend,
    prev_year: r.prev_year_spend ?? 0,
    prev_quarter: r.prev_period_spend ?? 0,
  }));

  return (
    <CardShell
      card={card}
      label="Spend trend"
      icon={<TrendingUp size={14} />}
      downloadRows={dlRows}
      downloadTitle={`Spend Trend · ${card.district}`}
      {...a}
    >
      <div style={{ height: 110 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 4, right: 4, left: -28, bottom: 0 }}
            barCategoryGap="22%"
            barGap={2}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--sm-border)"
              vertical={false}
            />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 9, fill: "var(--sm-fg-3)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "var(--sm-fg-3)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => v?.toFixed(2)}
            />
            <Tooltip
              contentStyle={{
                fontSize: 11,
                borderRadius: 8,
                border: "1px solid var(--sm-border)",
                background: "var(--sm-surface)",
                color: "var(--sm-fg-1)",
              }}
              cursor={{ fill: "rgba(21,28,44,.04)" }}
              formatter={(v: unknown) => [
                v != null ? Number(v).toFixed(3) : "—",
                "",
              ]}
            />
            {card.top3.map((r, i) => (
              <Bar
                key={r.location}
                dataKey={r.location}
                fill={TREND_COLORS[i % TREND_COLORS.length]}
                radius={[3, 3, 0, 0]}
                maxBarSize={18}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        {card.top3.map((r, i) => (
          <div
            key={r.location}
            style={{ display: "flex", alignItems: "center", gap: 4 }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: TREND_COLORS[i % TREND_COLORS.length],
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 10, color: "var(--sm-fg-3)" }}>
              {r.location}
            </span>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

// ── 3. Household composition card ─────────────────────────────────────────────

const HH_COLORS: Record<string, string> = {
  Families: "#6aa9aa",
  "Over 66": "#c48a3a",
  Students: "#7aa5d1",
  Working: "#4fa67f",
};

const HH_FILTER_KEYS: Record<string, HouseholdFilter> = {
  Families: "families",
  "Over 66": "over66",
  Students: "students",
  Working: "working",
};

export function CardHousehold({
  card,
  onHouseholdFilter,
  activeHouseholdFilter,
  ...a
}: {
  card: WorkspaceCard;
  onHouseholdFilter?: (f: HouseholdFilter | null) => void;
  activeHouseholdFilter?: HouseholdFilter | null;
} & Actions) {
  const hh = card.householdMetrics;
  if (!hh || hh.totalHouseholds === 0) return null;

  const rows = [
    { label: "Families", value: hh.familiesWithChildren },
    { label: "Over 66", value: hh.over66 },
    { label: "Students", value: hh.students },
    { label: "Working", value: hh.workingProfessionals },
  ];
  const total = hh.totalHouseholds;
  const isInteractive = !!onHouseholdFilter && card.mode === "destination";

  const dlRows = rows.map((r) => ({
    type: r.label,
    count: r.value,
    pct: pct(r.value, total),
    total_households: total,
  }));

  return (
    <CardShell
      card={card}
      label="Household types"
      icon={<Home size={14} />}
      downloadRows={dlRows}
      downloadTitle={`Household Types · ${card.district}`}
      {...a}
    >
      {isInteractive && (
        <div
          style={{
            fontSize: 10,
            color: "var(--sm-mint-ink)",
            background: "var(--sm-mint-soft)",
            borderRadius: 5,
            padding: "3px 7px",
            marginBottom: 8,
            display: "inline-block",
          }}
        >
          Click a type to filter the map
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {rows.map((r) => {
          const filter = HH_FILTER_KEYS[r.label];
          const isActive = activeHouseholdFilter === filter;
          const isDimmed = !!activeHouseholdFilter && !isActive;
          return (
            <div
              key={r.label}
              onClick={() =>
                isInteractive && onHouseholdFilter?.(isActive ? null : filter)
              }
              style={{
                cursor: isInteractive ? "pointer" : "default",
                opacity: isDimmed ? 0.38 : 1,
                transition: "opacity .18s",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  color: "var(--sm-fg-2)",
                  marginBottom: 3,
                }}
              >
                <span
                  style={{
                    fontWeight: isActive ? 700 : 400,
                    color: isActive ? "var(--sm-fg-1)" : "var(--sm-fg-2)",
                  }}
                >
                  {r.label}
                </span>
                <span
                  style={{
                    fontFamily: "monospace",
                    fontWeight: 600,
                    color: "var(--sm-fg-1)",
                  }}
                >
                  {fmt(r.value)} · {pct(r.value, total)}
                </span>
              </div>
              <div
                style={{
                  height: 5,
                  borderRadius: 3,
                  background: "var(--sm-surface-3)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${total > 0 ? (r.value / total) * 100 : 0}%`,
                    background: HH_COLORS[r.label] ?? "var(--sm-mint)",
                    borderRadius: 3,
                    transition: "width .4s",
                    opacity: isDimmed ? 0.3 : 1,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </CardShell>
  );
}

// ── 4. Gender split card ──────────────────────────────────────────────────────

export function CardGender({ card, ...a }: { card: WorkspaceCard } & Actions) {
  const cm = card.consumerMetrics;

  let female = 0,
    male = 0;
  if (cm) {
    female = cm.genderBreakdown.female;
    male = cm.genderBreakdown.male;
  } else if (card.mode === "origin" && card.originPopBreakdown) {
    female = card.originPopBreakdown.female;
    male = card.originPopBreakdown.male;
  } else {
    return null;
  }

  const gTotal = female + male;
  if (gTotal === 0) return null;

  const femPct = ((female / gTotal) * 100).toFixed(1);
  const malPct = ((male / gTotal) * 100).toFixed(1);

  const dlRows = [
    { gender: "Female", count: female, pct: femPct + "%" },
    { gender: "Male", count: male, pct: malPct + "%" },
  ];

  return (
    <CardShell
      card={card}
      label="Gender split"
      icon={<Users size={14} />}
      downloadRows={dlRows}
      downloadTitle={`Gender Split · ${card.district}`}
      {...a}
    >
      <div className="card-stats">
        <div className="card-stat">
          <div className="lbl">Female</div>
          <div className="val">{femPct}%</div>
          <div style={{ fontSize: 10, color: "var(--sm-fg-3)", marginTop: 2 }}>
            {fmt(female)}
          </div>
        </div>
        <div className="card-stat">
          <div className="lbl">Male</div>
          <div className="val">{malPct}%</div>
          <div style={{ fontSize: 10, color: "var(--sm-fg-3)", marginTop: 2 }}>
            {fmt(male)}
          </div>
        </div>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          overflow: "hidden",
          display: "flex",
          marginTop: 10,
        }}
      >
        <div
          style={{
            width: `${femPct}%`,
            background: "#f7b8a1",
            transition: "width .4s",
          }}
        />
        <div style={{ flex: 1, background: "#7aa5d1" }} />
      </div>
    </CardShell>
  );
}

// ── 5. Top flows card ─────────────────────────────────────────────────────────

export function CardTopFlows({
  card,
  ...a
}: { card: WorkspaceCard } & Actions) {
  if (!card.top3.length) return null;
  const isDiff = card.mapType === "difference";

  const flowLabel = isDiff
    ? "Top gainers"
    : card.mode === "destination"
      ? "Top origins"
      : "Top destinations";
  const colHeader = isDiff
    ? "District"
    : card.mode === "destination"
      ? "Origin"
      : "Destination";

  const dlRows = card.top3.map((f, i) => ({
    rank: i + 1,
    location: f.location,
    name: nameMap[f.location] ?? "",
    spend: f.spend,
  }));

  return (
    <CardShell
      card={card}
      label={flowLabel}
      icon={<BarChart3 size={14} />}
      downloadRows={dlRows}
      downloadTitle={`${flowLabel} · ${card.district}`}
      {...a}
    >
      <div className="card-flows">
        <div className="cf-head">
          <span>{colHeader}</span>
          <span>{isDiff ? "Diff" : "Spend %"}</span>
        </div>
        {card.top3.map((f, i) => (
          <div key={f.location} className="cf-row">
            <span className="cf-code">
              <span className="rank">{i + 1}</span>
              <span style={{ fontFamily: "monospace", fontWeight: 600 }}>
                {f.location}
              </span>
              {nameMap[f.location] && (
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--sm-fg-3)",
                    marginLeft: 5,
                  }}
                >
                  {nameMap[f.location]}
                </span>
              )}
            </span>
            <span
              className={`v${isDiff ? (f.spend >= 0 ? " pos" : " neg") : ""}`}
            >
              {isDiff && f.spend > 0 ? "+" : ""}
              {f.spend.toFixed(isDiff ? 2 : 3)}
            </span>
          </div>
        ))}
      </div>

      {isDiff && card.topNegative && card.topNegative.length > 0 && (
        <div className="card-flows" style={{ marginTop: 8 }}>
          <div className="cf-head">
            <span>Top decliners</span>
            <span>Diff</span>
          </div>
          {card.topNegative.map((f, i) => (
            <div key={f.location} className="cf-row">
              <span className="cf-code">
                <span className="rank">{i + 1}</span>
                <span style={{ fontFamily: "monospace", fontWeight: 600 }}>
                  {f.location}
                </span>
                {nameMap[f.location] && (
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--sm-fg-3)",
                      marginLeft: 5,
                    }}
                  >
                    {nameMap[f.location]}
                  </span>
                )}
              </span>
              <span className="v neg">{f.spend_diff.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
}

// ── 6. All flows card ─────────────────────────────────────────────────────────

export function CardAllFlows({
  card,
  ...a
}: { card: WorkspaceCard } & Actions) {
  const [search, setSearch] = useState("");
  const isDiff = card.mapType === "difference";
  const items = card.allItems;

  const filtered = useMemo(() => {
    if (!search) return items;
    const s = search.toLowerCase();
    return items.filter(
      (i) =>
        i.location.toLowerCase().includes(s) ||
        (nameMap[i.location] ?? "").toLowerCase().includes(s),
    );
  }, [items, search]);

  if (!items.length) return null;

  const dlRows = items.map((item) => ({
    location: item.location,
    name: nameMap[item.location] ?? "",
    spend: item.spend,
  }));

  return (
    <CardShell
      card={card}
      label={isDiff ? "All flow changes" : "All flows"}
      icon={<List size={14} />}
      downloadRows={dlRows}
      downloadTitle={`${isDiff ? "All flow changes" : "All flows"} · ${card.district}`}
      {...a}
    >
      {/* Search */}
      <div style={{ position: "relative", marginBottom: 8 }}>
        <Search
          size={11}
          style={{
            position: "absolute",
            left: 9,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--sm-fg-3)",
            pointerEvents: "none",
          }}
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search district…"
          style={{
            width: "100%",
            height: 30,
            paddingLeft: 28,
            paddingRight: 10,
            boxSizing: "border-box",
            background: "var(--sm-surface)",
            border: "1px solid var(--sm-border-strong)",
            borderRadius: 7,
            fontSize: 11,
            color: "var(--sm-fg-1)",
            fontFamily: "inherit",
            outline: "none",
          }}
        />
      </div>

      <div
        style={{
          maxHeight: 200,
          overflowY: "auto",
          borderRadius: 7,
          border: "1px solid var(--sm-border)",
        }}
      >
        <table
          style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}
        >
          <thead>
            <tr
              style={{
                background: "var(--sm-surface-2)",
                position: "sticky",
                top: 0,
              }}
            >
              <th
                style={{
                  padding: "5px 10px",
                  textAlign: "left",
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                  color: "var(--sm-fg-3)",
                  borderBottom: "1px solid var(--sm-border)",
                }}
              >
                District
              </th>
              <th
                style={{
                  padding: "5px 10px",
                  textAlign: "right",
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                  color: "var(--sm-fg-3)",
                  borderBottom: "1px solid var(--sm-border)",
                }}
              >
                {isDiff ? "Change" : "Spend %"}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={2}
                  style={{
                    padding: 14,
                    textAlign: "center",
                    color: "var(--sm-fg-3)",
                    fontStyle: "italic",
                    fontSize: 11,
                  }}
                >
                  No results
                </td>
              </tr>
            ) : (
              filtered.map((item, i) => (
                <tr
                  key={`${item.location}-${i}`}
                  style={{
                    borderTop: i > 0 ? "1px solid var(--sm-border)" : "none",
                  }}
                >
                  <td style={{ padding: "5px 10px" }}>
                    <span
                      style={{
                        fontWeight: 600,
                        color: "var(--sm-ink)",
                        fontFamily: "monospace",
                        fontSize: 11,
                      }}
                    >
                      {item.location}
                    </span>
                    {nameMap[item.location] && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 10,
                          color: "var(--sm-fg-3)",
                        }}
                      >
                        {nameMap[item.location]}
                      </span>
                    )}
                  </td>
                  <td
                    style={{
                      padding: "5px 10px",
                      textAlign: "right",
                      fontFamily: "monospace",
                      fontWeight: 600,
                      fontSize: 11,
                      color: isDiff
                        ? item.spend >= 0
                          ? "var(--sm-success-ink)"
                          : "var(--sm-danger-ink)"
                        : "var(--sm-mint-ink)",
                    }}
                  >
                    {isDiff && item.spend > 0 ? "+" : ""}
                    {Number(item.spend).toFixed(isDiff ? 2 : 3)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div
        style={{
          marginTop: 5,
          fontSize: 10,
          color: "var(--sm-fg-4)",
          textAlign: "right",
        }}
      >
        {filtered.length} / {items.length} districts
      </div>
    </CardShell>
  );
}

// ── 7. Age distribution card ──────────────────────────────────────────────────

const AGE_COLORS = [
  "#94a3b8",
  "#7aa5d1",
  "#6aa9aa",
  "#4fa67f",
  "#c48a3a",
  "#f7b8a1",
];

export function CardAgeDistribution({
  card,
  ...a
}: { card: WorkspaceCard } & Actions) {
  const destAb =
    card.mode === "destination"
      ? card.consumerMetrics?.ageBreakdown
      : undefined;
  const origAb =
    card.mode === "origin" && card.originPopBreakdown
      ? card.originPopBreakdown
      : undefined;
  const ab = destAb ?? origAb;
  if (!ab) return null;

  const rows = [
    { label: "0–15", value: ab.age_0_15, color: AGE_COLORS[0] },
    { label: "16–24", value: ab.age_16_24, color: AGE_COLORS[1] },
    { label: "25–34", value: ab.age_25_34, color: AGE_COLORS[2] },
    { label: "35–49", value: ab.age_35_49, color: AGE_COLORS[3] },
    { label: "50–64", value: ab.age_50_64, color: AGE_COLORS[4] },
    { label: "65+", value: ab.over_65, color: AGE_COLORS[5] },
  ];
  const total = rows.reduce((s, r) => s + r.value, 0);
  const dlRows = rows.map((r) => ({
    age_group: r.label,
    count: r.value,
    pct: pct(r.value, total),
  }));

  return (
    <CardShell
      card={card}
      label="Age distribution"
      icon={<Users size={14} />}
      downloadRows={dlRows}
      downloadTitle={`Age Distribution · ${card.district}`}
      {...a}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {rows.map((r) => (
          <div key={r.label}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11,
                color: "var(--sm-fg-2)",
                marginBottom: 3,
              }}
            >
              <span>{r.label}</span>
              <span
                style={{
                  fontFamily: "monospace",
                  fontWeight: 600,
                  color: "var(--sm-fg-1)",
                }}
              >
                {fmt(r.value)} · {pct(r.value, total)}
              </span>
            </div>
            <div
              style={{
                height: 5,
                borderRadius: 3,
                background: "var(--sm-surface-3)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${total > 0 ? (r.value / total) * 100 : 0}%`,
                  background: r.color,
                  borderRadius: 3,
                  transition: "width .4s",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

// ── CardSpec conversion ───────────────────────────────────────────────────────

export function workspaceSubCardToSpec(
  card: WorkspaceCard,
  subType: string,
): CardSpec | null {
  const period = `${card.year} ${card.quarter}`;
  const id = `manual-${card.id}-${subType}-${Date.now()}`;
  const title = (label: string) => `${label} · ${card.district} · ${period}`;

  switch (subType) {
    case "SpendSummary":
      return {
        id,
        type: "metric",
        title: title("Spend Summary"),
        district: card.district,
        data: [
          { label: "Districts", value: card.spendingItemCount },
          { label: card.mode === "origin" ? "TAM" : "TOM", value: card.mode === "origin" ? card.tam : card.tom },
          { label: "Population", value: card.population },
          ...(card.totalSpend != null ? [{ label: "Total Spend Idx", value: parseFloat(card.totalSpend.toFixed(3)) }] : []),
        ].filter((d) => d.value != null),
        config: { unit: "index", description: `${card.mode === "origin" ? "Outbound" : "Inbound"} spend summary` },
      };

    case "MarketOverview": {
      const penetration =
        card.tom != null && card.tam != null && card.tam > 0
          ? parseFloat(((card.tom / card.tam) * 100).toFixed(4))
          : null;
      return {
        id,
        type: "metric",
        title: title("Market Overview"),
        district: card.district,
        data: [
          { label: "TAM", value: card.tam },
          { label: "TOM", value: card.tom },
          ...(penetration != null ? [{ label: "Penetration %", value: penetration }] : []),
          ...(card.consumerMetrics ? [
            { label: "Total consumers", value: card.consumerMetrics.totalConsumers },
            { label: "Obtainable", value: card.consumerMetrics.obtainableConsumers },
          ] : []),
        ].filter((d) => d.value != null),
        config: { unit: "£", description: "Market size indicators" },
      };
    }

    case "Gender": {
      const cm = card.consumerMetrics;
      let female = 0, male = 0;
      if (cm) { female = cm.genderBreakdown.female; male = cm.genderBreakdown.male; }
      else if (card.originPopBreakdown) { female = card.originPopBreakdown.female; male = card.originPopBreakdown.male; }
      else return null;
      if (female + male === 0) return null;
      return {
        id,
        type: "gender-split",
        title: title("Gender Split"),
        district: card.district,
        data: [
          { label: "Female", value: female },
          { label: "Male", value: male },
        ],
        config: {},
      };
    }

    case "AgeDistribution": {
      const ab = card.mode === "destination"
        ? card.consumerMetrics?.ageBreakdown
        : card.originPopBreakdown ?? undefined;
      if (!ab) return null;
      return {
        id,
        type: "age-distribution",
        title: title("Age Distribution"),
        district: card.district,
        data: [
          { label: "0–15", value: ab.age_0_15 },
          { label: "16–24", value: ab.age_16_24 },
          { label: "25–34", value: ab.age_25_34 },
          { label: "35–49", value: ab.age_35_49 },
          { label: "50–64", value: ab.age_50_64 },
          { label: "65+", value: ab.over_65 },
        ],
        config: {},
      };
    }

    case "Household": {
      const hh = card.householdMetrics;
      if (!hh || hh.totalHouseholds === 0) return null;
      return {
        id,
        type: "household-types",
        title: title("Household Types"),
        district: card.district,
        data: [
          { label: "Families", value: hh.familiesWithChildren },
          { label: "Over 66", value: hh.over66 },
          { label: "Students", value: hh.students },
          { label: "Working", value: hh.workingProfessionals },
        ],
        config: {},
      };
    }

    case "TopFlows":
      if (!card.top3.length) return null;
      return {
        id,
        type: "bar",
        title: title(card.mapType === "difference" ? "Top Gainers" : card.mode === "destination" ? "Top Origins" : "Top Destinations"),
        district: card.district,
        data: card.top3.map((f) => ({
          location: f.location,
          name: nameMap[f.location] ?? f.location,
          spend: f.spend,
        })),
        config: { xKey: "name", yKey: "spend", unit: "index" },
      };

    case "AllFlows":
      if (!card.allItems.length) return null;
      return {
        id,
        type: "bar",
        title: title(card.mapType === "difference" ? "All Flow Changes" : "All Flows"),
        district: card.district,
        data: card.allItems.map((f) => ({
          location: f.location,
          name: nameMap[f.location] ?? f.location,
          spend: f.spend,
        })),
        config: { xKey: "name", yKey: "spend", unit: "index" },
      };

    case "SpendTrend":
      if (!card.top3.length) return null;
      return {
        id,
        type: "bar",
        title: title("Spend Trend"),
        district: card.district,
        data: [
          { period: "Last Year", ...Object.fromEntries(card.top3.map((r) => [r.location, r.prev_year_spend ?? null])) },
          { period: "Prev Quarter", ...Object.fromEntries(card.top3.map((r) => [r.location, r.prev_period_spend ?? null])) },
          { period: "Current", ...Object.fromEntries(card.top3.map((r) => [r.location, r.spend])) },
        ],
        config: { xKey: "period", yKey: card.top3.map((r) => r.location) },
      };

    default:
      return null;
  }
}

// ── 8. Market overview card (destination only) ────────────────────────────────

export function CardMarketOverview({
  card,
  ...a
}: { card: WorkspaceCard } & Actions) {
  if (card.mode !== "destination" || card.mapType === "difference") return null;
  const cm = card.consumerMetrics;
  const penetration =
    card.tom != null && card.tam != null && card.tam > 0
      ? (card.tom / card.tam) * 100
      : null;

  const dlRows: Record<string, unknown>[] = [
    { metric: "TAM", value: card.tam ?? 0 },
    { metric: "TOM", value: card.tom ?? 0 },
    {
      metric: "Penetration",
      value: penetration != null ? penetration.toFixed(4) + "%" : "—",
    },
    ...(cm
      ? [
          { metric: "Total consumers", value: cm.totalConsumers },
          { metric: "Obtainable", value: cm.obtainableConsumers },
        ]
      : []),
  ];

  return (
    <CardShell
      card={card}
      label="Market overview"
      icon={<BarChart2 size={14} />}
      downloadRows={dlRows}
      downloadTitle={`Market Overview · ${card.district}`}
      {...a}
    >
      <div className="card-stats">
        <div className="card-stat">
          <div className="lbl">TAM</div>
          <div className="val small">£{fmt(card.tam)}</div>
        </div>
        <div className="card-stat">
          <div className="lbl">TOM</div>
          <div className="val small">£{fmt(card.tom)}</div>
        </div>
        <div className="card-stat">
          <div className="lbl">Penetration</div>
          <div className="val small">
            {penetration != null ? penetration.toFixed(4) + "%" : "—"}
          </div>
          {penetration != null && <div className="unit">% share of TAM</div>}
        </div>
      </div>
      {cm && (
        <div className="card-stats" style={{ marginTop: 8 }}>
          <div className="card-stat">
            <div className="lbl">Total consumers</div>
            <div className="val small">{fmt(cm.totalConsumers)}</div>
          </div>
          <div className="card-stat">
            <div className="lbl">Obtainable</div>
            <div className="val small">{fmt(cm.obtainableConsumers)}</div>
            <div className="unit">people</div>
          </div>
        </div>
      )}
    </CardShell>
  );
}
