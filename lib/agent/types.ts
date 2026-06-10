// ─── Card Spec ────────────────────────────────────────────────────────────────

export type CardType = "bar" | "line" | "pie" | "metric" | "comparison" | "list" | "age-distribution" | "gender-split" | "household-types";

export interface CardConfig {
  xKey?: string;
  yKey?: string | string[];  // yKey can be array for multi-series
  nameKey?: string;
  valueKey?: string;
  keys?: string[];           // comparison card: metric keys to show per district
  colors?: string[];
  unit?: string;
  description?: string;
}

export interface CardSpec {
  id: string;
  type: CardType;
  title: string;
  district?: string;
  data: Record<string, unknown>[];
  config: CardConfig;
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export interface ToolCallRef {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  cards?: CardSpec[];
  isLoading?: boolean;
  toolCalls?: ToolCallRef[];   // intermediate assistant messages
  toolCallId?: string;         // tool messages
  toolName?: string;
  toolsUsed?: string[];        // final assistant message: tools invoked during this response
}

// ─── Map context passed from frontend ─────────────────────────────────────────

export interface MapContext {
  currentDistrict?: string;
  currentPeriod?: string;   // "2023#Q1"
  currentMode?: "origin" | "destination";
}

// ─── API request / response ───────────────────────────────────────────────────

export interface AgentRequest {
  message: string;
  token: string;
  sessionId: string;
  mapContext?: MapContext;
  history?: {
    role: "user" | "assistant" | "tool";
    content: string;
    toolCalls?: ToolCallRef[];
    toolCallId?: string;
  }[];
}

// ─── Card plan (produced by cardPlannerNode, rule-based) ─────────────────────

export interface CardPlan {
  type: CardType;
  district?: string;
  titleHint: string;
  data: Record<string, unknown>[];
  config: CardConfig;
}

// ─── Tool return types ────────────────────────────────────────────────────────

export interface SpendFlow {
  location: string;
  spend: number;                // display: cardholderIndexSpend (destination) or merchantIndexSpend (origin)
  cardholderIndexSpend: number; // % of merchant location's inflow from this cardholder location
  merchantIndexSpend: number;   // % of cardholder location's spending going to this merchant location
  name?: string;
}

export interface DistrictProfile {
  district: string;
  name?: string;
  population: number;
  female: number;
  male: number;
  age_0_15: number;
  age_16_24: number;
  age_25_34: number;
  age_35_49: number;
  age_50_64: number;
  over_65: number;
  households: number;
  families: number;
  over66: number;
  students: number;
  working: number;
  tam: number;
  gdhi: number;
}

export interface TrendPoint {
  period: string;
  totalSpend: number;
  topLocation: string;
}
