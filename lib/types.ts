export interface SpendFlow {
  district: string
  spend_ratio: number
  share: number
}

export interface SpendMapResponse {
  mode: "origin" | "destination"
  selected_district: string
  year: number
  quarter: string
  total_spend_ratio: number
  flows: SpendFlow[]
  top_3: string[]
}

export type Mode = "origin" | "destination"

export interface District {
  code: string
  name: string
}

export interface SpendingLocationItem {
  location: string
  spend: number
  prev_period_spend?: number;
  prev_year_spend?: number;
  tam?: number;
  tom?: number;
  cardholderSpend?: number;
}

export interface PopulationRow {
  postcode: string;
  age_0_15_f: number;
  age_16_24_f: number;
  age_25_34_f: number;
  age_35_49_f: number;
  age_50_64_f: number;
  over_65_f: number;
  age_0_15_m: number;
  age_16_24_m: number;
  age_25_34_m: number;
  age_35_49_m: number;
  age_50_64_m: number;
  over_65_m: number;
  total_population: number;
}

export interface ConsumerMetrics {
  totalConsumers: number;
  obtainableConsumers: number;
  genderBreakdown: { female: number; male: number };
  ageBreakdown: {
    age_0_15: number;
    age_16_24: number;
    age_25_34: number;
    age_35_49: number;
    age_50_64: number;
    over_65: number;
  };
}

export interface HouseholdRow {
  postcode: string;
  families_with_children: number;
  over_66: number;
  students: number;
  working_professionals: number;
  total_households: number;
}

export interface HouseholdMetrics {
  familiesWithChildren: number;
  over66: number;
  students: number;
  workingProfessionals: number;
  totalHouseholds: number;
}

export interface SpendingLocationResponse {
  data: SpendingLocationItem[]
  total_spend: number
  top_3_locations: SpendingLocationItem[]
}

export interface DiffLocationItem {
  location: string;
  start_spend: number;
  end_spend: number;
  spend_diff: number;
}

export type MapType = "standard" | "difference";

export interface ConsumerSegment {
  name: string;
  total: number;
  obtainable: number;
}

export type HouseholdFilter = "families" | "over66" | "students" | "working";