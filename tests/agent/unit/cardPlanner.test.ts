import { describe, it, expect } from "vitest";
import { ToolMessage } from "@langchain/core/messages";
import { planCards } from "@/lib/agent/graph";

// ─── Helper ───────────────────────────────────────────────────────────────────

function toolMsg(name: string, content: unknown): ToolMessage {
  return new ToolMessage({ tool_call_id: `tc-${name}`, name, content: JSON.stringify(content) });
}

// ─── getSpendingFlows ─────────────────────────────────────────────────────────

describe("getSpendingFlows", () => {
  const flows = [
    { location: "CV2", spend: 24.64, name: "Coventry" },
    { location: "CV6", spend: 9.32,  name: "Coventry North" },
  ];

  it("destination → 1 bar card", () => {
    const plans = planCards([toolMsg("getSpendingFlows", { district: "CV1", mode: "destination", flows })]);
    expect(plans).toHaveLength(1);
    expect(plans[0].type).toBe("bar");
    expect(plans[0].config.unit).toBeUndefined();
  });

  it("origin → 1 bar card with Outflow label", () => {
    const plans = planCards([toolMsg("getSpendingFlows", { district: "CV1", mode: "origin", flows })]);
    expect(plans[0].titleHint).toContain("Outflow");
  });

  it("empty flows → no cards", () => {
    const plans = planCards([toolMsg("getSpendingFlows", { district: "CV1", mode: "origin", flows: [] })]);
    expect(plans).toHaveLength(0);
  });
});

// ─── getDistrictProfile ───────────────────────────────────────────────────────

const singleProfile = {
  district: "CV2", name: "Coventry",
  population: 62119, female: 30000, male: 32119,
  age_0_15: 15192, age_16_24: 8146, age_25_34: 10310,
  age_35_49: 13738, age_50_64: 11733, over_65: 9000,
  households: 25000, families: 9041, over66: 4845,
  students: 1391, working: 11742,
  tam: 892000000, gdhi: 23500,
};

describe("getDistrictProfile — single", () => {
  it("1 profile → metric + age-distribution (2 cards)", () => {
    const plans = planCards([toolMsg("getDistrictProfile", { profiles: [singleProfile] })]);
    expect(plans).toHaveLength(2);
    expect(plans[0].type).toBe("metric");
    expect(plans[1].type).toBe("age-distribution");
  });

  it("metric card has 4 items (population, TAM, GDHI, households)", () => {
    const plans = planCards([toolMsg("getDistrictProfile", { profiles: [singleProfile] })]);
    expect(plans[0].data).toHaveLength(4);
    const labels = plans[0].data.map((d) => d.label);
    expect(labels).toContain("TAM");
    expect(labels).toContain("GDHI");
  });

  it("TAM and GDHI have unit £", () => {
    const plans = planCards([toolMsg("getDistrictProfile", { profiles: [singleProfile] })]);
    const tam  = plans[0].data.find((d) => d.label === "TAM")!;
    const gdhi = plans[0].data.find((d) => d.label === "GDHI")!;
    expect(tam.unit).toBe("£");
    expect(gdhi.unit).toBe("£");
  });

  it("age-distribution chart has up to 6 age groups", () => {
    const plans = planCards([toolMsg("getDistrictProfile", { profiles: [singleProfile] })]);
    expect(plans[1].data.length).toBeLessThanOrEqual(6);
    expect(plans[1].data.length).toBeGreaterThan(0);
  });

  it("all age values 0 → age-distribution data is empty", () => {
    const zeroed = { ...singleProfile, age_0_15: 0, age_16_24: 0, age_25_34: 0, age_35_49: 0, age_50_64: 0, over_65: 0 };
    const plans = planCards([toolMsg("getDistrictProfile", { profiles: [zeroed] })]);
    expect(plans[1].data).toHaveLength(0);
  });
});

describe("getDistrictProfile — multiple", () => {
  const profiles = [
    { ...singleProfile, district: "CV2" },
    { ...singleProfile, district: "CV6", name: "Coventry North" },
  ];

  it("2+ profiles → first card is comparison", () => {
    const plans = planCards([toolMsg("getDistrictProfile", { profiles })]);
    expect(plans.length).toBeGreaterThanOrEqual(1);
    expect(plans[0].type).toBe("comparison");
  });

  it("comparison config.keys is populated", () => {
    const plans = planCards([toolMsg("getDistrictProfile", { profiles })]);
    expect(plans[0].config.keys?.length).toBeGreaterThan(0);
  });

  it("empty profiles → no cards", () => {
    const plans = planCards([toolMsg("getDistrictProfile", { profiles: [] })]);
    expect(plans).toHaveLength(0);
  });
});

// ─── getSpendingTrend ─────────────────────────────────────────────────────────

describe("getSpendingTrend", () => {
  const trend = [
    { period: "2022#Q1", totalSpend: 120.5, topLocation: "CV6" },
    { period: "2022#Q2", totalSpend: 135.2, topLocation: "CV6" },
    { period: "2022#Q3", totalSpend: 128.8, topLocation: "CV6" },
  ];

  it("→ 1 line card", () => {
    const plans = planCards([toolMsg("getSpendingTrend", { district: "CV2", trend })]);
    expect(plans).toHaveLength(1);
    expect(plans[0].type).toBe("line");
  });

  it("empty trend → no cards", () => {
    const plans = planCards([toolMsg("getSpendingTrend", { district: "CV2", trend: [] })]);
    expect(plans).toHaveLength(0);
  });
});

// ─── getMarketPotential ───────────────────────────────────────────────────────

describe("getMarketPotential", () => {
  const flows = [
    { location: "CV2", name: "Coventry", spendIndex: 24.64, sourceTam: 892000000, marketPotential: 219820800 },
    { location: "CV6", name: "Coventry North", spendIndex: 9.32, sourceTam: 500000000, marketPotential: 46600000 },
  ];

  it("→ 1 bar card, unit £", () => {
    const plans = planCards([toolMsg("getMarketPotential", { district: "CV1", mode: "destination", flows })]);
    expect(plans).toHaveLength(1);
    expect(plans[0].type).toBe("bar");
    expect(plans[0].config.unit).toBe("£");
  });

  it("spend value in data comes from marketPotential", () => {
    const plans = planCards([toolMsg("getMarketPotential", { district: "CV1", mode: "destination", flows })]);
    expect(plans[0].data[0].spend).toBe(219820800);
  });

  it("empty flows → no cards", () => {
    const plans = planCards([toolMsg("getMarketPotential", { district: "CV1", mode: "destination", flows: [] })]);
    expect(plans).toHaveLength(0);
  });
});

// ─── getInflowTAMSummary ──────────────────────────────────────────────────────

describe("getInflowTAMSummary", () => {
  const payload = {
    district: "CV2", yearPeriod: "2023#Q1",
    totalSourceTAM: 5000000000, tom: 234000000, sourceCount: 120,
    topSources: [
      { location: "CV6", name: "Coventry North", spendIndex: 9.32, sourceTam: 500000000, marketPotential: 46600000 },
    ],
  };

  it("→ metric + bar (2 card)", () => {
    const plans = planCards([toolMsg("getInflowTAMSummary", payload)]);
    expect(plans).toHaveLength(2);
    expect(plans[0].type).toBe("metric");
    expect(plans[1].type).toBe("bar");
  });

  it("metric card: totalSourceTAM, TOM, sourceCount", () => {
    const plans = planCards([toolMsg("getInflowTAMSummary", payload)]);
    const labels = plans[0].data.map((d) => d.label);
    expect(labels).toContain("Total Source TAM");
    expect(labels).toContain("TOM");
    expect(labels).toContain("Source Districts");
  });

  it("empty topSources → only metric card", () => {
    const plans = planCards([toolMsg("getInflowTAMSummary", { ...payload, topSources: [] })]);
    expect(plans).toHaveLength(1);
    expect(plans[0].type).toBe("metric");
  });
});

// ─── listVenuesInDistrict ─────────────────────────────────────────────────────

describe("listVenuesInDistrict", () => {
  const venues = [
    { name: "Pizza Express", type: "restaurant", postcode: "CV1 1AB" },
    { name: "Nando's",       type: "restaurant", postcode: "CV1 2CD" },
  ];

  it("→ 1 list card", () => {
    const plans = planCards([toolMsg("listVenuesInDistrict", { district: "CV1", districtName: "Coventry", category: "restaurant", venues })]);
    expect(plans).toHaveLength(1);
    expect(plans[0].type).toBe("list");
  });

  it("category label is capitalised", () => {
    const plans = planCards([toolMsg("listVenuesInDistrict", { district: "CV1", districtName: "Coventry", category: "fast_food", venues })]);
    expect(plans[0].titleHint).toContain("Fast food");
  });

  it("empty venues → no cards", () => {
    const plans = planCards([toolMsg("listVenuesInDistrict", { district: "CV1", category: "restaurant", venues: [] })]);
    expect(plans).toHaveLength(0);
  });
});

// ─── getAreaZones ─────────────────────────────────────────────────────────────

describe("getAreaZones", () => {
  const payload = {
    district: "CV2",
    focus:    { districts: ["CV1", "CV3", "CV4"], description: "..." },
    wider:    { districts: ["CV6", "CV7"],        description: "..." },
    catchment: { districts: ["CV1", "CV3", "CV4", "CV6", "CV7"], description: "..." },
  };

  it("→ 1 metric card with zone counts", () => {
    const plans = planCards([toolMsg("getAreaZones", payload)]);
    expect(plans).toHaveLength(1);
    expect(plans[0].type).toBe("metric");
  });

  it("focus zone count is correct", () => {
    const plans = planCards([toolMsg("getAreaZones", payload)]);
    const focusItem = plans[0].data.find((d) => d.label === "Focus Area")!;
    expect(focusItem.value).toBe(3);
  });
});

// ─── compareDistricts ─────────────────────────────────────────────────────────

describe("compareDistricts", () => {
  const profiles = [
    { ...singleProfile, district: "CV2" },
    { ...singleProfile, district: "CV6", name: "Coventry North" },
  ];

  it("demographics → 1 comparison card", () => { // legacy tool, kept for compat
    const plans = planCards([toolMsg("compareDistricts", { metric: "demographics", districts: ["CV2", "CV6"], profiles })]);
    expect(plans).toHaveLength(1);
    expect(plans[0].type).toBe("comparison");
  });

  it("market → 1 comparison card", () => {
    const plans = planCards([toolMsg("compareDistricts", { metric: "market", districts: ["CV2", "CV6"], profiles })]);
    expect(plans[0].type).toBe("comparison");
  });

  it("spending → 1 bar card", () => {
    const results = [
      { district: "CV2", name: "Coventry", totalSpend: 120.5 },
      { district: "CV6", name: "Coventry North", totalSpend: 89.2 },
    ];
    const plans = planCards([toolMsg("compareDistricts", { metric: "spending", districts: ["CV2", "CV6"], results })]);
    expect(plans).toHaveLength(1);
    expect(plans[0].type).toBe("bar");
  });

  it("single profile demographics → no card (min 2 required)", () => {
    const plans = planCards([toolMsg("compareDistricts", { metric: "demographics", districts: ["CV2"], profiles: [profiles[0]] })]);
    expect(plans).toHaveLength(0);
  });
});

// ─── Edge case'ler ────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("malformed JSON tool result → no throw, no cards", () => {
    const msg = new ToolMessage({ tool_call_id: "tc-1", name: "getSpendingFlows", content: "bu json degil {{{" });
    expect(() => planCards([msg])).not.toThrow();
    expect(planCards([msg])).toHaveLength(0);
  });

  it("non-tool messages are ignored", () => {
    const { AIMessage, HumanMessage } = require("@langchain/core/messages");
    const msgs = [new HumanMessage("merhaba"), new AIMessage("DONE")];
    expect(planCards(msgs)).toHaveLength(0);
  });

  it("unknown tool name → no cards", () => {
    const plans = planCards([toolMsg("unknownTool", { foo: "bar" })]);
    expect(plans).toHaveLength(0);
  });

  it("multiple tools → multiple cards", () => {
    const flows = [{ location: "CV2", spend: 24.64, name: "Coventry" }];
    const trend = [
      { period: "2022#Q1", totalSpend: 120.5, topLocation: "CV6" },
      { period: "2022#Q2", totalSpend: 135.2, topLocation: "CV6" },
    ];
    const msgs = [
      toolMsg("getSpendingFlows", { district: "CV2", mode: "origin", flows }),
      toolMsg("getSpendingTrend",  { district: "CV2", trend }),
    ];
    const plans = planCards(msgs);
    expect(plans.length).toBeGreaterThanOrEqual(2);
    expect(plans.some((p) => p.type === "bar")).toBe(true);
    expect(plans.some((p) => p.type === "line")).toBe(true);
  });
});
