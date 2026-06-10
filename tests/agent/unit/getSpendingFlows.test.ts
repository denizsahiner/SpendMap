import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/agent/gql", () => ({
  withRetry: (fn: () => unknown) => fn(),
  gqlPaginate: vi.fn(async (_q: string, _v: unknown, _t: string, dataKey: string) => {
    if (dataKey === "listSpendRecordByMerchantLocationAndYearPeriod") {
      // cardholderIndexSpend = % of CV2's total inflow from this source (destination perspective)
      // merchantIndexSpend   = % of this source's spending going to CV2 (origin perspective)
      return [
        { cardholderLocation: "CV2", cardholderIndexSpend: 24.64, merchantIndexSpend: 17.184 },
        { cardholderLocation: "CV6", cardholderIndexSpend:  9.319, merchantIndexSpend:  5.362 },
        { cardholderLocation: "UNKNOWN", cardholderIndexSpend: 4.5, merchantIndexSpend:  3.0 },
      ];
    }
    if (dataKey === "listSpendRecordByCardholderLocationAndYearPeriod") {
      // merchantIndexSpend = % of CV2's spending going to this destination (origin perspective)
      return [
        { merchantLocation: "CV2", cardholderIndexSpend: 17.184, merchantIndexSpend: 24.64 },
        { merchantLocation: "CV6", cardholderIndexSpend:  5.362, merchantIndexSpend:  9.319 },
      ];
    }
    return [];
  }),
}));

import { getToolByName } from "../fixtures/toolHelper";

const getSpendingFlows = getToolByName("getSpendingFlows");

describe("getSpendingFlows", () => {
  it("destination mode — cardholderIndexSpend kullanılıyor (% of destination's inflow from source)", async () => {
    const result = await getSpendingFlows.invoke({
      district: "CV2", yearPeriod: "2023#Q1", mode: "destination", topN: 10,
    }) as { flows: Array<{ location: string; spend: number }> };

    const cv2 = result.flows.find(f => f.location === "CV2")!;
    expect(cv2.spend).toBe(24.64);        // cardholderIndexSpend
    expect(cv2.spend).not.toBe(17.184);   // merchantIndexSpend olmamalı
  });

  it("origin mode — merchantIndexSpend kullanılıyor (% of origin's spending going to destination)", async () => {
    const result = await getSpendingFlows.invoke({
      district: "CV2", yearPeriod: "2023#Q1", mode: "origin", topN: 10,
    }) as { flows: Array<{ location: string; spend: number }> };

    const cv2 = result.flows.find(f => f.location === "CV2")!;
    expect(cv2.spend).toBe(24.64);        // merchantIndexSpend
    expect(cv2.spend).not.toBe(17.184);   // cardholderIndexSpend olmamalı
  });

  it("UNKNOWN location'lar filtreleniyor", async () => {
    const result = await getSpendingFlows.invoke({
      district: "CV2", yearPeriod: "2023#Q1", mode: "destination", topN: 10,
    }) as { flows: Array<{ location: string }> };

    const locations = result.flows.map(f => f.location);
    expect(locations).not.toContain("UNKNOWN");
  });

  it("spend değerine göre azalan sıralı", async () => {
    const result = await getSpendingFlows.invoke({
      district: "CV2", yearPeriod: "2023#Q1", mode: "destination", topN: 10,
    }) as { flows: Array<{ spend: number }> };

    for (let i = 1; i < result.flows.length; i++) {
      expect(result.flows[i - 1].spend).toBeGreaterThanOrEqual(result.flows[i].spend);
    }
  });

  it("topN limiti uygulanıyor", async () => {
    const result = await getSpendingFlows.invoke({
      district: "CV2", yearPeriod: "2023#Q1", mode: "destination", topN: 1,
    }) as { flows: unknown[] };

    expect(result.flows.length).toBeLessThanOrEqual(1);
  });
});
