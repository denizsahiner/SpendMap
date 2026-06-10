"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type {
  ConsumerMetrics,
  HouseholdFilter,
  HouseholdMetrics,
  Mode,
  PopulationRow,
} from "@/lib/types";

interface ConsumerAnalysisPanelProps {
  mode: Mode;
  consumerMetrics?: ConsumerMetrics;
  originPopulation?: PopulationRow;
  householdMetrics?: HouseholdMetrics;
  isLoading: boolean;
  selectedHouseholdFilter?: HouseholdFilter | null;
  onHouseholdFilterChange?: (f: HouseholdFilter | null) => void;
}

const HH_NAME_TO_FILTER: Record<string, HouseholdFilter> = {
  Families: "families",
  "Over 66": "over66",
  Students: "students",
  Working: "working",
};

const AGE_COLORS = [
  "#8ce0c2",
  "#7fb2d6",
  "#f7b8a1",
  "#a78bfa",
  "#fbbf24",
  "#f472b6",
];
const HH_COLORS: Record<string, string> = {
  Families: "#8ce0c2",
  "Over 66": "#f7b8a1",
  Students: "#7fb2d6",
  Working: "#a78bfa",
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

function SectionHeader({ title }: { title: string }) {
  return (
    // Dikeyden tasarruf için mb-2
    <p className="text-[11px] font-bold uppercase tracking-widest text-[#8fa0b5] mb-2">
      {title}
    </p>
  );
}

function ChartTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: { name: string; value: number }[];
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
  return (
    <div
      style={{
        background: "#151c2c",
        border: "1px solid #2a3441",
        borderRadius: 8,
        padding: "5px 10px",
        fontSize: 12,
      }}
    >
      <p style={{ color: "#c4d0e0", marginBottom: 1 }}>{name}</p>
      <p style={{ color: "#8ce0c2", fontWeight: 700 }}>
        {fmt(value)}{" "}
        <span style={{ color: "#8fa0b5", fontWeight: 400 }}>({pct}%)</span>
      </p>
    </div>
  );
}

function PieWithLegend({
  title,
  data,
  colors,
  highlightTop = 0,
  sortLegend = true,
  selectedSlice,
  onSliceClick,
}: {
  title: string;
  data: { name: string; value: number; color?: string }[];
  colors: string[];
  highlightTop?: number;
  sortLegend?: boolean;
  selectedSlice?: string | null;
  onSliceClick?: (name: string) => void;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const sorted = sortLegend ? [...data].sort((a, b) => b.value - a.value) : data;
  const isInteractive = !!onSliceClick;
  const hasSelection = isInteractive && selectedSlice != null;
  const activeIdx = selectedSlice != null ? data.findIndex((d) => d.name === selectedSlice) : -1;

  return (
    <div className="flex flex-1 flex-col min-w-0 px-8 py-3">
      <SectionHeader title={title} />
      <div className="flex items-center gap-6 min-h-0 h-full">
        <div className="shrink-0" style={{ width: 104, height: 104, cursor: isInteractive ? "pointer" : "default" }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart style={{ outline: "none" }}>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={32}
                outerRadius={48}
                activeIndex={activeIdx >= 0 ? activeIdx : undefined}
                // @ts-ignore — activeOuterRadius tip tanımında eksik ama çalışıyor
                activeOuterRadius={54}
                paddingAngle={2}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
                stroke="none"
                onClick={(entry: any) => onSliceClick?.(entry.name)}
                style={{ outline: "none" }}
              >
                {data.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.color ?? colors[i % colors.length]}
                    opacity={hasSelection && selectedSlice !== d.name ? 0.25 : 1}
                    style={{ outline: "none" }}
                  />
                ))}
              </Pie>
              {/* @ts-ignore */}
              <Tooltip content={<ChartTooltip total={total} />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          {sorted.map((d, i) => {
            const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : "0";
            const color = d.color ?? colors[data.indexOf(d) % colors.length];
            const isTop = highlightTop > 0 && i < highlightTop;
            const isSelected = selectedSlice === d.name;
            const isDimmed = hasSelection && !isSelected;
            return (
              <div
                key={d.name}
                className={`flex items-center gap-2.5 min-w-0 transition-opacity ${isInteractive ? "cursor-pointer hover:opacity-80" : ""}`}
                style={{ opacity: isDimmed ? 0.35 : 1 }}
                onClick={() => onSliceClick?.(d.name)}
              >
                <span
                  className="shrink-0 h-2.5 w-2.5 rounded-full"
                  style={{ background: color }}
                />
                <span
                  className={`truncate text-[11px] ${isSelected ? "text-white font-semibold" : isTop ? "text-[#c4d0e0] font-medium" : "text-[#8fa0b5]"}`}
                >
                  {d.name}
                </span>
                {isSelected && (
                  <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-[#8ce0c2] bg-[#8ce0c2]/10 px-1.5 py-0.5 rounded-full">
                    active
                  </span>
                )}
                <span
                  className={`ml-auto shrink-0 text-xs font-semibold ${isSelected ? "text-[#8ce0c2]" : isTop ? "text-[#8ce0c2]" : "text-[#8fa0b5]"}`}
                >
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-widest text-[#8fa0b5] mb-2 truncate">
        {label}
      </p>
      <p
        className={`text-3xl font-bold leading-none ${accent ? "text-[#8ce0c2]" : "text-white"}`}
      >
        {value}
      </p>
      {sub && <p className="text-[11px] text-[#8fa0b5] mt-2 truncate">{sub}</p>}
    </div>
  );
}

function GenderSection({ female, male }: { female: number; male: number }) {
  const total = female + male;
  const femaleP = total > 0 ? `${((female / total) * 100).toFixed(1)}%` : "—";
  const maleP = total > 0 ? `${((male / total) * 100).toFixed(1)}%` : "—";

  return (
    // Alanı eşit paylaşması için "flex-1" verildi
    <div className="flex flex-1 flex-col px-8 py-3">
      <SectionHeader title="Gender Split" />
      {/* 24px mt-6 kusursuz hizalama için kaldı */}
      <div className="flex flex-row gap-8 mt-6">
        {[
          { label: "Female", pct: femaleP, count: female, color: "#f7b8a1" },
          { label: "Male", pct: maleP, count: male, color: "#7fb2d6" },
        ].map(({ label, pct, count, color }) => (
          <div key={label} className="flex flex-1 items-start gap-3">
            <span
              className="shrink-0 h-3 w-3 rounded-full mt-2.5"
              style={{ background: color }}
            />
            <div className="min-w-0">
              <p className="text-3xl font-bold text-white leading-none mb-2">
                {pct}
              </p>
              <div className="flex flex-col gap-0.5">
                <p className="text-sm text-[#8fa0b5]">{label}</p>
                <p className="text-[11px] text-[#8ce0c2]">({fmt(count)})</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ConsumerAnalysisPanel({
  mode,
  consumerMetrics,
  originPopulation,
  householdMetrics,
  selectedHouseholdFilter,
  onHouseholdFilterChange,
}: ConsumerAnalysisPanelProps) {
  if (mode === "destination" && consumerMetrics) {
    const {
      totalConsumers,
      obtainableConsumers,
      genderBreakdown,
      ageBreakdown,
    } = consumerMetrics;
    const pct =
      totalConsumers > 0
        ? `${((obtainableConsumers / totalConsumers) * 100).toFixed(1)}%`
        : "0%";

    const ageData = [
      { name: "0–15", value: ageBreakdown.age_0_15 },
      { name: "16–24", value: ageBreakdown.age_16_24 },
      { name: "25–34", value: ageBreakdown.age_25_34 },
      { name: "35–49", value: ageBreakdown.age_35_49 },
      { name: "50–64", value: ageBreakdown.age_50_64 },
      { name: "65+", value: ageBreakdown.over_65 },
    ];

    const hhData = householdMetrics
      ? [
          {
            name: "Families",
            value: householdMetrics.familiesWithChildren,
            color: HH_COLORS["Families"],
          },
          {
            name: "Over 66",
            value: householdMetrics.over66,
            color: HH_COLORS["Over 66"],
          },
          {
            name: "Students",
            value: householdMetrics.students,
            color: HH_COLORS["Students"],
          },
          {
            name: "Working",
            value: householdMetrics.workingProfessionals,
            color: HH_COLORS["Working"],
          },
        ]
      : [];

    return (
      <div className="flex h-full w-full divide-x divide-[#2a3441] overflow-hidden">
        {/* Alanı eşit paylaşması için "flex-1" verildi */}
        <div className="flex flex-1 flex-col px-8 py-3">
          <SectionHeader title="Overview" />
          <div className="flex flex-row items-start gap-4 mt-0">
            <MetricCard
              label="Total Consumers"
              value={fmt(totalConsumers)}
              sub="lit origin areas"
            />
            <MetricCard
              label="Obtainable"
              value={fmt(obtainableConsumers)}
              sub={`${pct} weighted`}
              accent
            />
          </div>
        </div>

        <GenderSection
          female={genderBreakdown.female}
          male={genderBreakdown.male}
        />
        <PieWithLegend
          title="Age Distribution"
          data={ageData}
          colors={AGE_COLORS}
          sortLegend={false}
        />

        {householdMetrics && (
          <PieWithLegend
            title="Household Composition"
            data={hhData}
            colors={[]}
            highlightTop={2}
            selectedSlice={selectedHouseholdFilter ? Object.entries(HH_NAME_TO_FILTER).find(([, v]) => v === selectedHouseholdFilter)?.[0] : null}
            onSliceClick={(name) => {
              const filter = HH_NAME_TO_FILTER[name];
              if (!filter) return;
              onHouseholdFilterChange?.(selectedHouseholdFilter === filter ? null : filter);
            }}
          />
        )}
      </div>
    );
  }

  if (mode === "origin" && originPopulation) {
    const pop = originPopulation;
    const totalFemale =
      pop.age_0_15_f +
      pop.age_16_24_f +
      pop.age_25_34_f +
      pop.age_35_49_f +
      pop.age_50_64_f +
      pop.over_65_f;
    const totalMale =
      pop.age_0_15_m +
      pop.age_16_24_m +
      pop.age_25_34_m +
      pop.age_35_49_m +
      pop.age_50_64_m +
      pop.over_65_m;

    const ageData = [
      { name: "0–15", value: pop.age_0_15_f + pop.age_0_15_m },
      { name: "16–24", value: pop.age_16_24_f + pop.age_16_24_m },
      { name: "25–34", value: pop.age_25_34_f + pop.age_25_34_m },
      { name: "35–49", value: pop.age_35_49_f + pop.age_35_49_m },
      { name: "50–64", value: pop.age_50_64_f + pop.age_50_64_m },
      { name: "65+", value: pop.over_65_f + pop.over_65_m },
    ];

    const hhData = householdMetrics
      ? [
          {
            name: "Families",
            value: householdMetrics.familiesWithChildren,
            color: HH_COLORS["Families"],
          },
          {
            name: "Over 66",
            value: householdMetrics.over66,
            color: HH_COLORS["Over 66"],
          },
          {
            name: "Students",
            value: householdMetrics.students,
            color: HH_COLORS["Students"],
          },
          {
            name: "Working",
            value: householdMetrics.workingProfessionals,
            color: HH_COLORS["Working"],
          },
        ]
      : [];

    return (
      <div className="flex h-full w-full divide-x divide-[#2a3441] overflow-hidden">
        {/* Origin paneli için de flex-1 kullanıldı */}
        <div className="flex flex-1 flex-col px-8 py-3">
          <SectionHeader title="Overview" />
          <div className="flex flex-row items-start gap-4 mt-0">
            <MetricCard
              label="Total Population"
              value={fmt(pop.total_population)}
              sub={`${pop.postcode} district`}
              accent
            />
          </div>
        </div>

        <GenderSection female={totalFemale} male={totalMale} />
        <PieWithLegend
          title="Age Distribution"
          data={ageData}
          colors={AGE_COLORS}
          sortLegend={false}
        />

        {householdMetrics && (
          <PieWithLegend
            title="Household Composition"
            data={hhData}
            colors={[]}
            highlightTop={2}
          />
        )}
      </div>
    );
  }

  return null;
}
