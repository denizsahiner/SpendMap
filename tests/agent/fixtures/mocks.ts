import { vi } from "vitest";
import { CV2_PROFILE } from "./cv2";

// Mock gqlPaginate — returns controlled data without hitting AppSync.
// Import this before importing tools in unit tests.
export function mockGqlPaginate(overrides: Record<string, unknown[]> = {}) {
  return vi.mock("@/lib/agent/gql", () => ({
    withRetry: (fn: () => unknown) => fn(),
    gqlPaginate: vi.fn(
      async (_query: string, variables: Record<string, unknown>, _token: string, dataKey: string) => {
        if (overrides[dataKey]) return overrides[dataKey];

        if (dataKey === "listPostcodeData") {
          return [{ postcode: variables.pc, tam: CV2_PROFILE.tam, gdhi: CV2_PROFILE.gdhi, householdCount: CV2_PROFILE.households }];
        }
        if (dataKey === "listPopulationData") {
          return [{
            postcode: variables.pc,
            total_population: CV2_PROFILE.population,
            age_0_15_f: 7500, age_16_24_f: 4000, age_25_34_f: 5100, age_35_49_f: 6800, age_50_64_f: 5800, over_65_f: 4500,
            age_0_15_m: 7692, age_16_24_m: 4146, age_25_34_m: 5210, age_35_49_m: 6938, age_50_64_m: 5933, over_65_m: 4501,
          }];
        }
        if (dataKey === "listHouseholdData") {
          return [{ postcode: variables.pc, total_households: CV2_PROFILE.households, families_with_children: 9041, over_66: 4845, students: 1391, working_professionals: 11742 }];
        }
        if (dataKey === "listSpendRecordByMerchantLocationAndYearPeriod") {
          return [
            { cardholderLocation: "CV2", cardholderIndexSpend: 24.64, merchantIndexSpend: 31.2 },
            { cardholderLocation: "CV6", cardholderIndexSpend:  9.319, merchantIndexSpend: 11.1 },
            { cardholderLocation: "CV3", cardholderIndexSpend:  3.364, merchantIndexSpend:  4.2 },
          ];
        }
        if (dataKey === "listSpendRecordByCardholderLocationAndYearPeriod") {
          return [
            { merchantLocation: "CV2", cardholderIndexSpend: 24.64, merchantIndexSpend: 31.2 },
            { merchantLocation: "CV6", cardholderIndexSpend:  9.319, merchantIndexSpend: 11.1 },
          ];
        }
        return [];
      },
    ),
  }));
}
