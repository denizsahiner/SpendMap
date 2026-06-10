import { ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import type { CardPlan, DistrictProfile, SpendFlow, TrendPoint } from "./types";

// ─── planCards ────────────────────────────────────────────────────────────────
// Rule-based card generation from ToolMessages. Exported for unit tests.

export function planCards(messages: BaseMessage[]): CardPlan[] {
  const plans: CardPlan[] = [];

  for (const msg of messages) {
    if (!(msg instanceof ToolMessage)) continue;

    const toolName = (msg as ToolMessage).name;
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(String((msg as ToolMessage).content)) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!result || typeof result !== "object") continue;

    if (toolName === "getSpendingFlows") {
      const flows = result.flows as SpendFlow[] | undefined;
      if (!flows?.length) continue;
      const mode = result.mode === "destination" ? "Inflow" : "Outflow";
      plans.push({
        type: "bar",
        district: String(result.district ?? ""),
        titleHint: `Spending Flows — ${result.district} (${mode})`,
        data: flows.map(f => ({ location: f.location, spend: f.spend, name: f.name })),
        config: { xKey: "location", yKey: "spend" },
      });
    }

    if (toolName === "getDistrictProfile") {
      const profiles = result.profiles as DistrictProfile[] | undefined;
      if (!profiles?.length) continue;

      if (profiles.length === 1) {
        const p = profiles[0];
        plans.push({
          type: "metric",
          district: p.district,
          titleHint: `${p.name ?? p.district} Key Figures`,
          data: [
            { label: "Population", value: p.population },
            { label: "TAM",        value: p.tam,  unit: "£" },
            { label: "GDHI",       value: p.gdhi, unit: "£" },
            { label: "Households", value: p.households },
          ],
          config: {},
        });
        plans.push({
          type: "age-distribution",
          district: p.district,
          titleHint: `${p.name ?? p.district} Age Distribution`,
          data: [
            { name: "0–15",  value: p.age_0_15 },
            { name: "16–24", value: p.age_16_24 },
            { name: "25–34", value: p.age_25_34 },
            { name: "35–49", value: p.age_35_49 },
            { name: "50–64", value: p.age_50_64 },
            { name: "65+",   value: p.over_65 },
          ].filter(d => (d.value as number) > 0),
          config: { nameKey: "name", valueKey: "value" },
        });
      } else {
        plans.push({
          type: "comparison",
          titleHint: "District Comparison",
          data: profiles.map(p => ({
            district:   p.district,
            name:       p.name ?? p.district,
            population: p.population,
            tam:        p.tam,
            gdhi:       p.gdhi,
            households: p.households,
          })),
          config: { keys: ["population", "tam", "gdhi", "households"] },
        });

        const n = profiles.length;
        const label = `${n} Districts`;

        const ageData = [
          { name: "0–15",  value: profiles.reduce((s, p) => s + (p.age_0_15  as number), 0) },
          { name: "16–24", value: profiles.reduce((s, p) => s + (p.age_16_24 as number), 0) },
          { name: "25–34", value: profiles.reduce((s, p) => s + (p.age_25_34 as number), 0) },
          { name: "35–49", value: profiles.reduce((s, p) => s + (p.age_35_49 as number), 0) },
          { name: "50–64", value: profiles.reduce((s, p) => s + (p.age_50_64 as number), 0) },
          { name: "65+",   value: profiles.reduce((s, p) => s + (p.over_65   as number), 0) },
        ].filter(d => d.value > 0);
        if (ageData.length > 0) {
          plans.push({
            type: "age-distribution",
            titleHint: `${label} — Age Distribution`,
            data: ageData,
            config: { nameKey: "name", valueKey: "value" },
          });
        }

        const totalMale   = profiles.reduce((s, p) => s + (p.male   as number), 0);
        const totalFemale = profiles.reduce((s, p) => s + (p.female as number), 0);
        if (totalMale + totalFemale > 0) {
          plans.push({
            type: "gender-split",
            titleHint: `${label} — Gender Split`,
            data: [
              { name: "Female", value: totalFemale },
              { name: "Male",   value: totalMale },
            ].filter(d => d.value > 0),
            config: { nameKey: "name", valueKey: "value" },
          });
        }

        const householdData = [
          { name: "Families", value: profiles.reduce((s, p) => s + (p.families as number), 0) },
          { name: "Over 66",  value: profiles.reduce((s, p) => s + (p.over66   as number), 0) },
          { name: "Students", value: profiles.reduce((s, p) => s + (p.students as number), 0) },
          { name: "Working",  value: profiles.reduce((s, p) => s + (p.working  as number), 0) },
        ].filter(d => d.value > 0);
        if (householdData.length > 0) {
          plans.push({
            type: "household-types",
            titleHint: `${label} — Household Types`,
            data: householdData,
            config: { nameKey: "name", valueKey: "value" },
          });
        }
      }
    }

    if (toolName === "getSpendingTrend") {
      const district = String(result.district ?? "");
      if (result.type === "series") {
        const series = result.series as Array<{ location: string; name?: string; trend: { period: string; spend: number }[] }> | undefined;
        if (!series?.length) continue;
        for (const s of series) {
          plans.push({
            type: "line",
            district,
            titleHint: `${s.name ?? s.location} → ${district} Trend`,
            data: s.trend.map(t => ({ period: t.period, spend: t.spend })),
            config: { xKey: "period", yKey: "spend" },
          });
        }
      } else {
        const trend = result.trend as TrendPoint[] | undefined;
        if (!trend?.length) continue;
        plans.push({
          type: "line",
          district,
          titleHint: `Spending Trend — ${district}`,
          data: trend.map(t => ({ period: t.period, totalSpend: t.totalSpend })),
          config: { xKey: "period", yKey: "totalSpend" },
        });
      }
    }

    if (toolName === "listVenuesInDistrict") {
      const venues = result.venues as Record<string, unknown>[] | undefined;
      if (!venues?.length) continue;
      const cat = String(result.category ?? "");
      const catLabel = cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, " ");
      plans.push({
        type: "list",
        district: String(result.district ?? ""),
        titleHint: `${catLabel} in ${result.districtName ?? result.district}`,
        data: venues,
        config: {},
      });
    }

    // ── Legacy handlers — tools removed from LLM context but kept for test compat
    if (toolName === "getMarketPotential") {
      const flows = result.flows as Array<{ location: string; name?: string; marketPotential: number }> | undefined;
      if (!flows?.length) continue;
      const mode = result.mode === "destination" ? "Inflow" : "Outflow";
      plans.push({
        type: "bar",
        district: String(result.district ?? ""),
        titleHint: `Market Potential — ${result.district} (${mode})`,
        data: flows.map(f => ({ location: f.location, spend: f.marketPotential, name: f.name })),
        config: { xKey: "location", yKey: "spend", unit: "£" },
      });
    }

    if (toolName === "getInflowTAMSummary") {
      const topSources = result.topSources as Array<{ location: string; name?: string; marketPotential: number }> | undefined;
      plans.push({
        type: "metric",
        district: String(result.district ?? ""),
        titleHint: `Inflow Summary — ${result.district}`,
        data: [
          { label: "Total Source TAM", value: result.totalSourceTAM, unit: "£" },
          { label: "TOM",              value: result.tom,            unit: "£" },
          { label: "Source Districts", value: result.sourceCount },
        ],
        config: {},
      });
      if (topSources?.length) {
        plans.push({
          type: "bar",
          district: String(result.district ?? ""),
          titleHint: `Top Inflow Sources — ${result.district}`,
          data: topSources.map(f => ({ location: f.location, spend: f.marketPotential, name: f.name })),
          config: { xKey: "location", yKey: "spend", unit: "£" },
        });
      }
    }

    if (toolName === "getAreaZones") {
      const focus    = result.focus    as { districts: string[] } | undefined;
      const wider    = result.wider    as { districts: string[] } | undefined;
      const catchment = result.catchment as { districts: string[] } | undefined;
      if (focus && wider && catchment) {
        plans.push({
          type: "metric",
          district: String(result.district ?? ""),
          titleHint: `Catchment Zones — ${result.district}`,
          data: [
            { label: "Focus Area",     value: focus.districts.length,    unit: "districts" },
            { label: "Wider Area",     value: wider.districts.length,    unit: "districts" },
            { label: "Full Catchment", value: catchment.districts.length, unit: "districts" },
          ],
          config: {},
        });
      }
    }

    if (toolName === "getTopDistricts") {
      const ranked = result.ranked as SpendFlow[] | undefined;
      if (!ranked?.length) continue;
      const dir = result.direction === "bottom" ? "Bottom" : "Top";
      plans.push({
        type: "bar",
        district: String(result.district ?? ""),
        titleHint: `${dir} Districts — ${result.district}`,
        data: ranked.map(f => ({ location: f.location, spend: f.spend, name: f.name })),
        config: { xKey: "location", yKey: "spend" },
      });
    }

    if (toolName === "getCustomerProfile") {
      const cp = result.customerProfile as Record<string, number> | null | undefined;
      const label = String(result.regionName ?? "Region");

      const topOrigins = result.topOriginDistricts as Array<{ location: string; name?: string; score: number; appearances: number }> | undefined;
      if (topOrigins?.length) {
        plans.push({
          type: "bar",
          titleHint: `Customer Origins — ${label}`,
          data: topOrigins.slice(0, 20).map(o => ({ location: o.location, spend: o.score, name: o.name })),
          config: { xKey: "location", yKey: "spend" },
        });
      }

      if (cp && cp.population > 0) {
        plans.push({
          type: "metric",
          titleHint: `${label} Customer Profile`,
          data: [
            { label: "Customer Population", value: cp.population },
            { label: "Customer TAM",        value: cp.tam,  unit: "£" },
            { label: "Avg GDHI",            value: cp.gdhi, unit: "£" },
            { label: "Households",          value: cp.households },
          ],
          config: {},
        });

        const ageData = [
          { name: "0–15",  value: cp.age_0_15 },
          { name: "16–24", value: cp.age_16_24 },
          { name: "25–34", value: cp.age_25_34 },
          { name: "35–49", value: cp.age_35_49 },
          { name: "50–64", value: cp.age_50_64 },
          { name: "65+",   value: cp.over_65 },
        ].filter(d => d.value > 0);
        if (ageData.length > 0) {
          plans.push({
            type: "age-distribution",
            titleHint: `${label} Customer Age Distribution`,
            data: ageData,
            config: { nameKey: "name", valueKey: "value" },
          });
        }

        if (cp.female + cp.male > 0) {
          plans.push({
            type: "gender-split",
            titleHint: `${label} Customer Gender Split`,
            data: [
              { name: "Female", value: cp.female },
              { name: "Male",   value: cp.male },
            ].filter(d => d.value > 0),
            config: { nameKey: "name", valueKey: "value" },
          });
        }

        const householdData = [
          { name: "Families", value: cp.families },
          { name: "Over 66",  value: cp.over66 },
          { name: "Students", value: cp.students },
          { name: "Working",  value: cp.working },
        ].filter(d => d.value > 0);
        if (householdData.length > 0) {
          plans.push({
            type: "household-types",
            titleHint: `${label} Customer Household Types`,
            data: householdData,
            config: { nameKey: "name", valueKey: "value" },
          });
        }
      }
    }

    if (toolName === "getRegionProfile") {
      const pop = result.population as number | undefined;
      if (!pop) continue;

      const label = String(result.regionName ?? `${result.districtCount} districts`);

      plans.push({
        type: "metric",
        titleHint: `${label} Key Figures`,
        data: [
          { label: "Population", value: pop },
          { label: "TAM",        value: result.tam,  unit: "£" },
          { label: "GDHI",       value: result.gdhi, unit: "£" },
          { label: "Households", value: result.households },
        ],
        config: {},
      });

      const ageData = [
        { name: "0–15",  value: result.age_0_15  as number },
        { name: "16–24", value: result.age_16_24 as number },
        { name: "25–34", value: result.age_25_34 as number },
        { name: "35–49", value: result.age_35_49 as number },
        { name: "50–64", value: result.age_50_64 as number },
        { name: "65+",   value: result.over_65   as number },
      ].filter((d) => d.value > 0);
      if (ageData.length > 0) {
        plans.push({
          type: "age-distribution",
          titleHint: `${label} Age Distribution`,
          data: ageData,
          config: { nameKey: "name", valueKey: "value" },
        });
      }

      const female = result.female as number ?? 0;
      const male   = result.male   as number ?? 0;
      if (female + male > 0) {
        plans.push({
          type: "gender-split",
          titleHint: `${label} Gender Split`,
          data: [
            { name: "Female", value: female },
            { name: "Male",   value: male },
          ].filter((d) => d.value > 0),
          config: { nameKey: "name", valueKey: "value" },
        });
      }

      const householdData = [
        { name: "Families", value: result.families as number ?? 0 },
        { name: "Over 66",  value: result.over66   as number ?? 0 },
        { name: "Students", value: result.students as number ?? 0 },
        { name: "Working",  value: result.working  as number ?? 0 },
      ].filter((d) => d.value > 0);
      if (householdData.length > 0) {
        plans.push({
          type: "household-types",
          titleHint: `${label} Household Types`,
          data: householdData,
          config: { nameKey: "name", valueKey: "value" },
        });
      }
    }

    if (toolName === "compareDistricts") {
      const metric = String(result.metric ?? "");
      if (metric === "demographics" || metric === "market") {
        const profiles = result.profiles as DistrictProfile[] | undefined;
        if (profiles && profiles.length >= 2) {
          plans.push({
            type: "comparison",
            titleHint: `District Comparison — ${metric}`,
            data: profiles.map(p => ({
              district:   p.district,
              name:       p.name ?? p.district,
              population: p.population,
              tam:        p.tam,
              gdhi:       p.gdhi,
              households: p.households,
            })),
            config: { keys: ["population", "tam", "gdhi", "households"] },
          });
        }
      } else if (metric === "spending") {
        const results = result.results as Array<{ district: string; name?: string; totalSpend: number }> | undefined;
        if (results?.length) {
          plans.push({
            type: "bar",
            titleHint: "Spending Comparison",
            data: results.map(r => ({ location: r.district, spend: r.totalSpend, name: r.name })),
            config: { xKey: "location", yKey: "spend" },
          });
        }
      }
    }
  }

  return plans;
}

// ─── computeAnalysis ─────────────────────────────────────────────────────────
// Extends planCards with derived computations:
//   • Catchment zone classification (replaces getAreaZones tool)
//   • Market potential in £ (replaces getMarketPotential tool)
//   • Inflow TAM summary (replaces getInflowTAMSummary tool)
// All computations are pure: reads ToolMessages already in state, no API calls.

export function computeAnalysis(messages: BaseMessage[]): CardPlan[] {
  const plans = planCards(messages);

  // Collect flow and profile data from ToolMessages
  interface FlowResult {
    district: string;
    mode: "origin" | "destination";
    flows: SpendFlow[];
  }
  const flowResults: FlowResult[] = [];
  const profilesByDistrict = new Map<string, DistrictProfile>();

  for (const msg of messages) {
    if (!(msg instanceof ToolMessage)) continue;
    const toolName = (msg as ToolMessage).name;
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(String((msg as ToolMessage).content)) as Record<string, unknown>;
    } catch { continue; }
    if (!result || typeof result !== "object") continue;

    if (toolName === "getSpendingFlows") {
      const flows = result.flows as SpendFlow[] | undefined;
      if (flows?.length) {
        flowResults.push({
          district: String(result.district ?? ""),
          mode:     (result.mode as "origin" | "destination") ?? "origin",
          flows,
        });
      }
    }

    if (toolName === "getDistrictProfile") {
      const profiles = result.profiles as DistrictProfile[] | undefined;
      if (profiles?.length) {
        for (const p of profiles) profilesByDistrict.set(p.district, p);
      }
    }
  }

  // Derived cards per flow result
  for (const { district, mode, flows } of flowResults) {

    // ── Catchment zone classification ──────────────────────────────────────────
    const focus   = flows.filter(f => f.spend >= 1.0).length;
    const wider   = flows.filter(f => f.spend > 0 && f.spend < 1.0).length;
    if (focus + wider > 0) {
      plans.push({
        type: "metric",
        district,
        titleHint: `Catchment Zones — ${district}`,
        data: [
          { label: "Focus Area",     value: focus,         unit: "districts" },
          { label: "Wider Area",     value: wider,         unit: "districts" },
          { label: "Full Catchment", value: focus + wider, unit: "districts" },
        ],
        config: {},
      });
    }

    // ── Market potential ───────────────────────────────────────────────────────
    if (mode === "destination") {
      // destination: counterpartTAM × (cardholderIndexSpend / 100)
      const enriched = flows
        .map(f => {
          const profile = profilesByDistrict.get(f.location);
          if (!profile?.tam) return null;
          return {
            location:        f.location,
            name:            f.name,
            marketPotential: Math.round(profile.tam * (f.cardholderIndexSpend / 100)),
          };
        })
        .filter((f): f is NonNullable<typeof f> => f !== null && f.marketPotential > 0)
        .sort((a, b) => b.marketPotential - a.marketPotential);

      if (enriched.length > 0) {
        const totalMP = enriched.reduce((s, f) => s + f.marketPotential, 0);
        plans.push({
          type: "bar",
          district,
          titleHint: `Market Potential — ${district} (Inflow)`,
          data: enriched.map(f => ({ location: f.location, spend: f.marketPotential, name: f.name })),
          config: { xKey: "location", yKey: "spend", unit: "£" },
        });
        plans.push({
          type: "metric",
          district,
          titleHint: `Inflow Summary — ${district}`,
          data: [
            { label: "TOM",              value: totalMP,          unit: "£" },
            { label: "Source Districts", value: enriched.length },
          ],
          config: {},
        });
      }

    } else {
      // origin: primaryTAM × (merchantIndexSpend / 100)
      const primaryProfile = profilesByDistrict.get(district);
      if (primaryProfile?.tam) {
        const enriched = flows
          .map(f => ({
            location:        f.location,
            name:            f.name,
            marketPotential: Math.round(primaryProfile.tam * (f.merchantIndexSpend / 100)),
          }))
          .filter(f => f.marketPotential > 0)
          .sort((a, b) => b.marketPotential - a.marketPotential);

        if (enriched.length > 0) {
          plans.push({
            type: "bar",
            district,
            titleHint: `Market Potential — ${district} (Outflow)`,
            data: enriched.map(f => ({ location: f.location, spend: f.marketPotential, name: f.name })),
            config: { xKey: "location", yKey: "spend", unit: "£" },
          });
        }
      }
    }
  }

  return plans;
}
