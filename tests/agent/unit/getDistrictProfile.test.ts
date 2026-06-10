import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/agent/gql", () => ({
  withRetry: (fn: () => unknown) => fn(),
  gqlPaginate: vi.fn(async (_q: string, _v: unknown, _t: string, dataKey: string) => {
    if (dataKey === "listPostcodeData") {
      return [{ postcode: "CV2", tam: 801_198_497.8, gdhi: 29_176.93, householdCount: 27_019 }];
    }
    if (dataKey === "listPopulationData") {
      return [{
        postcode: "CV2", total_population: 68_120,
        age_0_15_f: 7500,  age_16_24_f: 4000,  age_25_34_f: 5100,  age_35_49_f: 6800,  age_50_64_f: 5800,  over_65_f: 4500,
        age_0_15_m: 7692,  age_16_24_m: 4146,  age_25_34_m: 5210,  age_35_49_m: 6938,  age_50_64_m: 5933,  over_65_m: 4501,
      }];
    }
    if (dataKey === "listHouseholdData") {
      return [{ postcode: "CV2", total_households: 27_019, families_with_children: 9041, over_66: 4845, students: 1391, working_professionals: 11742 }];
    }
    return [];
  }),
}));

import { getToolByName } from "../fixtures/toolHelper";

const getDistrictProfile = getToolByName("getDistrictProfile");

describe("getDistrictProfile", () => {
  it("tam ve gdhi doğru alınıyor", async () => {
    const result = await getDistrictProfile.invoke({ districts: ["CV2"] }) as
      { profiles: Array<{ tam: number; gdhi: number }> };

    expect(result.profiles[0].tam).toBe(801_198_497.8);
    expect(result.profiles[0].gdhi).toBe(29_176.93);
  });

  it("toplam nüfus doğru", async () => {
    const result = await getDistrictProfile.invoke({ districts: ["CV2"] }) as
      { profiles: Array<{ population: number }> };

    expect(result.profiles[0].population).toBe(68_120);
  });

  it("female = tüm yaş gruplarının kadın toplamı", async () => {
    const result = await getDistrictProfile.invoke({ districts: ["CV2"] }) as
      { profiles: Array<{ female: number }> };

    expect(result.profiles[0].female).toBe(7500 + 4000 + 5100 + 6800 + 5800 + 4500);
  });

  it("male = tüm yaş gruplarının erkek toplamı", async () => {
    const result = await getDistrictProfile.invoke({ districts: ["CV2"] }) as
      { profiles: Array<{ male: number }> };

    expect(result.profiles[0].male).toBe(7692 + 4146 + 5210 + 6938 + 5933 + 4501);
  });

  it("age_25_34 = kadın + erkek 25-34 toplamı", async () => {
    const result = await getDistrictProfile.invoke({ districts: ["CV2"] }) as
      { profiles: Array<{ age_25_34: number }> };

    expect(result.profiles[0].age_25_34).toBe(5100 + 5210);
  });

  it("households ve working_professionals doğru", async () => {
    const result = await getDistrictProfile.invoke({ districts: ["CV2"] }) as
      { profiles: Array<{ households: number; working: number }> };

    expect(result.profiles[0].households).toBe(27_019);
    expect(result.profiles[0].working).toBe(11_742);
  });
});
