import { describe, it, expect, vi } from "vitest";

const SOURCE_TAM = 801_198_497.8;

vi.mock("@/lib/agent/gql", () => ({
  withRetry: (fn: () => unknown) => fn(),
  gqlPaginate: vi.fn(async (_q: string, variables: Record<string, unknown>, _t: string, dataKey: string) => {
    if (dataKey === "listSpendRecordByMerchantLocationAndYearPeriod") {
      // cardholderIndexSpend = % of destination's inflow from source → used for display & TOM formula
      // merchantIndexSpend   = % of source's spending going to destination
      return [
        { cardholderLocation: "CV2", cardholderIndexSpend: 24.64, merchantIndexSpend: 17.184 },
        { cardholderLocation: "CV6", cardholderIndexSpend:  9.319, merchantIndexSpend:  5.362 },
      ];
    }
    if (dataKey === "listPostcodeData") {
      return [{ postcode: variables.pc, tam: SOURCE_TAM, gdhi: 29176.93, householdCount: 27019 }];
    }
    if (dataKey === "listPopulationData" || dataKey === "listHouseholdData") return [];
    return [];
  }),
}));

import { getToolByName } from "../fixtures/toolHelper";

const getMarketPotential = getToolByName("getMarketPotential");

describe("getMarketPotential", () => {
  it("formül: marketPotential = sourceTAM × (spendIndex / 100)", async () => {
    const result = await getMarketPotential.invoke({
      district: "CV2", yearPeriod: "2023#Q1", mode: "destination",
    }) as { flows: Array<{ location: string; spendIndex: number; sourceTam: number; marketPotential: number }> };

    const cv2 = result.flows.find(f => f.location === "CV2")!;

    const expected = Math.round(SOURCE_TAM * (24.64 / 100));
    expect(cv2.marketPotential).toBe(expected);
  });

  it("merchantIndexSpend (17.184) formülde KULLANILMIYOR, cardholderIndexSpend (24.64) kullanılıyor", async () => {
    const result = await getMarketPotential.invoke({
      district: "CV2", yearPeriod: "2023#Q1", mode: "destination",
    }) as { flows: Array<{ location: string; marketPotential: number }> };

    const cv2 = result.flows.find(f => f.location === "CV2")!;
    const wrongValue = Math.round(SOURCE_TAM * (17.184 / 100));
    expect(cv2.marketPotential).not.toBe(wrongValue);
  });

  it("totalMarketPotential tüm akışların toplamı", async () => {
    const result = await getMarketPotential.invoke({
      district: "CV2", yearPeriod: "2023#Q1", mode: "destination",
    }) as { flows: Array<{ marketPotential: number }>; totalMarketPotential: number };

    const sumFromFlows = result.flows.reduce((s, f) => s + f.marketPotential, 0);
    expect(result.totalMarketPotential).toBe(Math.round(sumFromFlows));
  });

  it("spendIndex alanı cardholderIndexSpend değerini döndürüyor (£ değil)", async () => {
    const result = await getMarketPotential.invoke({
      district: "CV2", yearPeriod: "2023#Q1", mode: "destination",
    }) as { flows: Array<{ location: string; spendIndex: number }> };

    const cv2 = result.flows.find(f => f.location === "CV2")!;
    expect(cv2.spendIndex).toBe(24.64);  // cardholderIndexSpend, £ değil
  });

  it("sonuçlar marketPotential'a göre azalan sıralı", async () => {
    const result = await getMarketPotential.invoke({
      district: "CV2", yearPeriod: "2023#Q1", mode: "destination",
    }) as { flows: Array<{ marketPotential: number }> };

    for (let i = 1; i < result.flows.length; i++) {
      expect(result.flows[i - 1].marketPotential).toBeGreaterThanOrEqual(result.flows[i].marketPotential);
    }
  });
});
