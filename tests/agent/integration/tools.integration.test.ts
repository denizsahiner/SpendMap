import { describe, it, expect, beforeAll } from "vitest";
import { createTools } from "@/lib/agent/tools";
import {
  CV2_PROFILE,
  CV2_INFLOW_TOP3,
  CV2_TOM_2023Q1,
  CV2_INFLOW_SUMMARY_2023Q1,
} from "../fixtures/cv2";

// Integration testler DEV_APPSYNC_TOKEN gerektirir.
// Çalıştırmak için: DEV_APPSYNC_TOKEN=<token> npm run test:integration

const TOKEN = process.env.DEV_APPSYNC_TOKEN;

beforeAll(() => {
  if (!TOKEN) throw new Error("DEV_APPSYNC_TOKEN env var gerekli (integration testler için)");
});

function tools() {
  return createTools(TOKEN!) as unknown as Array<{ name: string; invoke: (a: unknown) => Promise<unknown> }>;
}
function tool(name: string) {
  const t = tools().find(t => t.name === name);
  if (!t) throw new Error(`Tool not found: ${name}`);
  return t;
}

describe("getDistrictProfile — CV2 gerçek veri", () => {
  it("TAM doğru", async () => {
    const result = await tool("getDistrictProfile").invoke({ districts: ["CV2"] }) as
      { profiles: Array<{ tam: number }> };
    expect(result.profiles[0].tam).toBeCloseTo(CV2_PROFILE.tam, -3); // ±1000 tolerans
  });

  it("GDHI doğru", async () => {
    const result = await tool("getDistrictProfile").invoke({ districts: ["CV2"] }) as
      { profiles: Array<{ gdhi: number }> };
    expect(result.profiles[0].gdhi).toBeCloseTo(CV2_PROFILE.gdhi, 0);
  });

  it("nüfus doğru", async () => {
    const result = await tool("getDistrictProfile").invoke({ districts: ["CV2"] }) as
      { profiles: Array<{ population: number }> };
    expect(result.profiles[0].population).toBe(CV2_PROFILE.population);
  });
});

describe("getSpendingFlows — CV2 destination 2023Q1", () => {
  it("top 3 kaynak bölgeler ve spendIndex değerleri doğru", async () => {
    const result = await tool("getSpendingFlows").invoke({
      district: "CV2", yearPeriod: "2023#Q1", mode: "destination", topN: 5,
    }) as { flows: Array<{ location: string; spend: number }> };

    for (const expected of CV2_INFLOW_TOP3) {
      const flow = result.flows.find(f => f.location === expected.location);
      expect(flow, `${expected.location} flow bulunamadı`).toBeDefined();
      expect(flow!.spend).toBeCloseTo(expected.spendIndex, 1);
    }
  });

  it("UNKNOWN location dönmüyor", async () => {
    const result = await tool("getSpendingFlows").invoke({
      district: "CV2", yearPeriod: "2023#Q1", mode: "destination", topN: 50,
    }) as { flows: Array<{ location: string }> };

    expect(result.flows.map(f => f.location)).not.toContain("UNKNOWN");
  });
});

describe("getMarketPotential — CV2 destination 2023Q1", () => {
  it("TOM £303.7M civarında (±%3)", async () => {
    const result = await tool("getMarketPotential").invoke({
      district: "CV2", yearPeriod: "2023#Q1", mode: "destination", topN: 50,
    }) as { totalMarketPotential: number };

    expect(result.totalMarketPotential).toBeGreaterThan(CV2_TOM_2023Q1.min);
    expect(result.totalMarketPotential).toBeLessThan(CV2_TOM_2023Q1.max);
  });
});

describe("getInflowTAMSummary — CV2 2023Q1", () => {
  it("kaynak bölge sayısı 683", async () => {
    const result = await tool("getInflowTAMSummary").invoke({
      district: "CV2", yearPeriod: "2023#Q1",
    }) as { sourceCount: number };

    expect(result.sourceCount).toBe(CV2_INFLOW_SUMMARY_2023Q1.sourceCount);
  });

  it("TOM £303.7M civarında (±%3)", async () => {
    const result = await tool("getInflowTAMSummary").invoke({
      district: "CV2", yearPeriod: "2023#Q1",
    }) as { tom: number };

    expect(result.tom).toBeGreaterThan(CV2_TOM_2023Q1.min);
    expect(result.tom).toBeLessThan(CV2_TOM_2023Q1.max);
  });
});

describe("resolveDistricts", () => {
  it("'Coventry' → CV1 içeriyor (CV2='Rugby' olduğu için Coventry aramasında çıkmaz)", async () => {
    const result = await tool("resolveDistricts").invoke({ query: "Coventry" }) as
      { districts: string[] };
    expect(result.districts).toContain("CV1");
  });

  it("'London' → geocoding ile çok sayıda district döndürüyor (≥10)", async () => {
    const result = await tool("resolveDistricts").invoke({ query: "London" }) as
      { districts: string[]; matched: number };
    expect(result.districts.length).toBeGreaterThanOrEqual(10);
    // Central London districtlarından en az biri var olmalı
    const centralLondon = ["E1", "N1", "SW1A", "SE1", "WC1", "EC1A"];
    const hasCentral = centralLondon.some(d => result.districts.includes(d));
    expect(hasCentral, `London araması central district içermiyor: ${result.districts.slice(0, 10).join(", ")}`).toBe(true);
  }, 30_000);

  it("'CV2' kodu direkt eşleşiyor", async () => {
    const result = await tool("resolveDistricts").invoke({ query: "CV2" }) as
      { districts: string[] };
    expect(result.districts).toContain("CV2");
    expect(result.districts.length).toBe(1);
  });
});
