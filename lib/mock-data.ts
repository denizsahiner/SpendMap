import type { SpendMapResponse, District } from "./types"

// Sample UK postcode districts for the demo
export const UK_DISTRICTS: District[] = [
  { code: "CV2", name: "Coventry Central" },
  { code: "CV21", name: "Rugby" },
  { code: "OX3", name: "Oxford East" },
  { code: "NW2", name: "London Cricklewood" },
  { code: "B1", name: "Birmingham City Centre" },
  { code: "M1", name: "Manchester City Centre" },
  { code: "L1", name: "Liverpool City Centre" },
  { code: "E1", name: "London Whitechapel" },
  { code: "SW1", name: "London Westminster" },
  { code: "G1", name: "Glasgow City Centre" },
  { code: "EH1", name: "Edinburgh Old Town" },
  { code: "CF1", name: "Cardiff City Centre" },
  { code: "LS1", name: "Leeds City Centre" },
  { code: "S1", name: "Sheffield City Centre" },
  { code: "NE1", name: "Newcastle City Centre" },
  { code: "BS1", name: "Bristol City Centre" },
  { code: "NG1", name: "Nottingham City Centre" },
  { code: "LE1", name: "Leicester City Centre" },
  { code: "CB1", name: "Cambridge City Centre" },
  { code: "BN1", name: "Brighton City Centre" },
]

export const YEARS = [2019, 2020, 2021, 2022, 2023]
export const QUARTERS = ["Q1", "Q2", "Q3", "Q4"]

// Generate mock spend flow data
export function generateMockData(
  mode: "origin" | "destination",
  district: string,
  year: number,
  quarter: string
): SpendMapResponse {
  // Create deterministic but varied data based on inputs
  const seed = `${district}${year}${quarter}${mode}`.split("").reduce((a, b) => a + b.charCodeAt(0), 0)
  
  const otherDistricts = UK_DISTRICTS.filter(d => d.code !== district)
  const numFlows = 8 + (seed % 7) // 8-14 flows
  
  // Generate flows with decreasing shares
  const flows = otherDistricts
    .slice(0, numFlows)
    .map((d, i) => {
      const baseShare = 0.35 - (i * 0.035) + ((seed + i) % 10) * 0.005
      const share = Math.max(0.01, Math.min(0.45, baseShare))
      const spend_ratio = share * (0.2 + ((seed + i) % 5) * 0.05)
      return {
        district: d.code,
        spend_ratio: Math.round(spend_ratio * 1000) / 1000,
        share: Math.round(share * 1000) / 1000,
      }
    })
    .sort((a, b) => b.share - a.share)

  // Normalize shares to sum to ~1
  const totalShare = flows.reduce((sum, f) => sum + f.share, 0)
  flows.forEach(f => {
    f.share = Math.round((f.share / totalShare) * 1000) / 1000
  })

  const top_3 = flows.slice(0, 3).map(f => f.district)
  const total_spend_ratio = flows.reduce((sum, f) => sum + f.spend_ratio, 0)

  return {
    mode,
    selected_district: district,
    year,
    quarter,
    total_spend_ratio: Math.round(total_spend_ratio * 1000) / 1000,
    flows,
    top_3,
  }
}
