import { StateGraph, START, END, MessagesAnnotation, Annotation } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { z } from "zod";
import { createSpatialTools, createDataTools } from "./tools";
import { computeAnalysis } from "./analysis-node";
import type { CardPlan, MapContext } from "./types";

// ─── Backwards-compat re-export (used by unit tests) ─────────────────────────
export { planCards } from "./analysis-node";

// ─── State ────────────────────────────────────────────────────────────────────

const SpendMapState = Annotation.Root({
  ...MessagesAnnotation.spec,
  next:             Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  analysisComplete: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
  dataAgentRan:     Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
  cardPlans:        Annotation<CardPlan[]>({ reducer: (_, b) => b ?? [], default: () => [] }),
  mapContext:       Annotation<MapContext | undefined>({ reducer: (_, b) => b, default: () => undefined }),
});

// ─── System prompts ───────────────────────────────────────────────────────────

function buildSupervisorPrompt(state: typeof SpendMapState.State): string {
  const msgs = state.messages;

  const SPATIAL_TOOLS = new Set(["resolveDistricts", "resolveVenue", "getTravelTimeDistricts", "getDistrictsInRadius", "listVenuesInDistrict"]);
  const hasSpatialResults = msgs.some(m => m instanceof ToolMessage && SPATIAL_TOOLS.has((m as ToolMessage).name ?? ""));

  const ctx = state.mapContext
    ? `Current map: district=${state.mapContext.currentDistrict ?? "none"}, period=${state.mapContext.currentPeriod ?? "2023#Q4"}, mode=${state.mapContext.currentMode ?? "origin"}.`
    : "";

  return `You are the orchestrator of a UK spending analytics assistant.${ctx ? "\n" + ctx : ""}

Current pipeline state:
- spatialDone: ${hasSpatialResults}
- dataAgentRan: ${state.dataAgentRan}
- analysisComplete: ${state.analysisComplete}

Routing rules — apply in strict order:

RULE 0 — Route directly to "final" (skip all agents) if BOTH are true:
  (a) The message is a greeting, small talk, or contains no request for data or analysis.
      Examples: "hello", "thanks", "what can you do?", "hi there", "thank you"
  (b) The message is a pure concept/definition question AND no specific district or location
      appears in the USER'S MESSAGE ITSELF (map context alone does NOT count).
      Examples: "what is TAM?", "explain spend index", "how does TOM work?"

  NEVER apply RULE 0 if the message contains any city, town, region, or place name
  (e.g. "London", "Londra", "Manchester", "Birmingham", "Coventry", "West Midlands").
  A place name means spatial resolution is needed — always route to "spatial" instead.

  IMPORTANT: the presence of a district in map context does NOT require data fetching
  unless the user's message explicitly asks about that district.

RULE 1 — If spatialDone is false AND the query references a place name, city, venue, travel time, radius, or ANY named geographic area → "spatial"
  SKIP if: query contains only postcode district codes (CV2, W1B, M1, LE67) with no other place names AND is NOT asking about venues, shops, restaurants, cafes, or any list of places.
  SKIP if: spatialDone is already true.

RULE 2 — If dataAgentRan is false AND (spatial not needed OR spatialDone is true) → "data"

RULE 3 — If dataAgentRan is true AND analysisComplete is false → "analysis"

RULE 4 — If analysisComplete is true → "final"

Output ONLY valid JSON with no other text: {"next": "spatial"|"data"|"analysis"|"final"}`;
}

function buildSpatialPrompt(mapContext?: MapContext): string {
  const ctx = mapContext
    ? `Current map: district=${mapContext.currentDistrict ?? "none"}, period=${mapContext.currentPeriod ?? "2023#Q4"}, mode=${mapContext.currentMode ?? "origin"}.`
    : "";

  return `You are the Spatial Agent for SpendMap, a UK spending analytics platform.${ctx ? "\n" + ctx : ""}

YOUR JOB: resolve geographic references AND fetch venue listings when requested.

TOOLS:
- resolveDistricts: city/region names → district codes. Use when user says "Coventry", "North London", "Manchester" etc.
- resolveVenue: specific named place → district. Use for "Westfield", "Bluewater", "Trafford Centre" etc.
  - If resolveVenue returns inUK: false → output DONE immediately (out-of-UK venues not supported)
- listVenuesInDistrict: list venues of a specific category in a district.
  ALWAYS call this when the user asks for a list of shops, restaurants, venues, or any place category in a district.
  The district may already be a postcode code (e.g. W1B) — call it directly without resolving first.
  Pick the category that best matches the user's intent (e.g. "shopping_centre", "restaurant", "gym", "pharmacy" etc.)
- getDistrictsInRadius: districts within a km radius. Use ONLY for explicit km/miles radius queries
- getTravelTimeDistricts: districts within a travel time isochrone. Use for all time-based queries (walking, driving, transit, cycling)
  - searchType "departure": what can be REACHED from district (outflow/reachability)
  - searchType "arrival": what can REACH the district (catchment/inflow)
  - Modes: "public transport/bus/train" → public_transport | "walk" → walking | "cycle" → cycling | "drive/car" → driving

RULES:
- Call parallel tools when independent
- Output the single word DONE when all required tools have been called
- NEVER output anything else — tool calls or DONE only`;
}

function buildDataPrompt(mapContext?: MapContext): string {
  const ctx = mapContext
    ? `\nCurrent map: district=${mapContext.currentDistrict ?? "none"}, period=${mapContext.currentPeriod ?? "2023#Q4"}, mode=${mapContext.currentMode ?? "origin"}.`
    : "";

  return `You are the Data Agent for SpendMap, a UK spending analytics platform.${ctx}

YOUR ONLY JOB: fetch raw spending and demographic data from the database.

TOOLS:
- getSpendingFlows: fetch spending flow data (origin or destination mode)
- getDistrictProfile: fetch demographic + market profile for 1–10 districts in one call
- getSpendingTrend: fetch spending trend across multiple time periods
- getRegionProfile: aggregate RESIDENT demographic profile across many districts for a city or region — population, age, gender, households, TAM, GDHI of people who LIVE there (not visitors or customers)
- getCustomerProfile: find who SPENDS in a region — aggregates destination-mode flows across all districts, ranks origin districts by contribution, returns their combined demographics. Use for customer/visitor profile queries on regions with 2+ districts.

FINDING DISTRICTS:
Check the conversation history for district codes. They come from:
1. Spatial Agent tool results (look for "districts" arrays or "district" fields in previous tool messages)
2. The user's message directly (e.g. "CV2", "W1B")
3. The current map context above

ORIGIN vs DESTINATION — determine correct mode before calling getSpendingFlows:
- DESTINATION (mode="destination"): questions about what flows INTO a district as a commercial location.
  Keywords: "accessible market", "market value of X", "market potential", "what X attracts", "customers of X", "inflow"
- ORIGIN (mode="origin"): questions about a district's own residents.
  Keywords: "residents of X", "people in X", "where does X spend", "outflow from X"
- Single named district + "market value/accessible market/market potential" → default DESTINATION

DEFAULT VALUES:
- yearPeriod: "${mapContext?.currentPeriod ?? "2023#Q4"}" unless user specifies otherwise
- mode: "${mapContext?.currentMode ?? "origin"}" unless overridden above

CRITICAL DATA FETCHING RULES:

RESIDENT/DEMOGRAPHIC PROFILE QUERIES — highest priority rule:
When the conversation history contains a resolveDistricts result with 5 or more districts
AND the user asks about population, demographics, age, gender, households, residents, or people who live there,
or market profile (TAM/GDHI) for that region:
  1. Call getRegionProfile({ districts: [...all resolved districts...], regionName: "city name" }) — single call.
  2. Output DONE immediately after — do not call any spending tools.
  This applies to: "London demographics", "Manchester population profile", "West Midlands resident profile", etc.
  NOTE: This is RESIDENT data — people who live in the region. Do NOT use this for customer profile queries.

REGION CUSTOMER PROFILE — large region (5+ districts):
When the user asks about the CUSTOMER profile, VISITOR profile, "who spends in X", "who shops in X" for a region with 5+ districts:
  1. Call getCustomerProfile({ districts: [...all resolved districts...], yearPeriod, regionName }) — single call.
  2. Output DONE immediately after — do not call any additional tools.
  This handles: "customer profile of London", "who shops in Manchester", "visitor profile of West Midlands", etc.

CUSTOMER PROFILE QUERIES — applies when target is a SINGLE commercial district (1–4 districts):
When the user asks about the CUSTOMER profile, VISITOR profile, "who shops in X", "who comes to X",
or asks to COMPARE customer profiles of multiple districts:
  1. Call getSpendingFlows(district, mode="destination", topN=300) for EACH target district in parallel.
     This reveals WHERE customers come from (source districts).
  2. From each result, identify the FOCUS AREA source districts (spend >= 1.0) — up to the first 10.
  3. Call getDistrictProfile ONLY for those focus area SOURCE districts (NOT for the target districts themselves).
     The target districts' own residents are NOT their customers.
  4. Output DONE after completing the above — do not fetch anything else.

STANDARD DATA FETCHING (all other queries):
- After calling getSpendingFlows, ALWAYS call getDistrictProfile for the counterpart districts
  returned in the flows array (up to 10 at a time). This enables market potential computation.
  - destination mode: fetch profiles for the SOURCE districts in flows[].location
  - origin mode: also fetch getDistrictProfile([primaryDistrict]) for the primary district's own TAM
- When user asks for a demographic/market COMPARISON of 2+ districts (resident profiles, not customer profiles)
  → call getDistrictProfile([d1, d2, ...]) in a single call
- When user asks "all" sources/destinations → pass topN: 1000 to getSpendingFlows
- Call parallel tools when they are independent

RULES:
- Output the single word DONE when all required data has been fetched
- NEVER output anything else — tool calls or DONE only`;
}

function buildFinalSystemPrompt(mapContext?: MapContext): string {
  const ctx = mapContext
    ? `\nCurrent map state: district=${mapContext.currentDistrict ?? "none"}, period=${mapContext.currentPeriod ?? "2023#Q1"}, mode=${mapContext.currentMode ?? "origin"}.`
    : "";

  return `You are SpendMap AI, an analyst assistant for a UK postcode district spending analytics platform.
You have access to real spending, demographic, and market data that has already been gathered for you.${ctx}

STRICT RULES — NEVER VIOLATE:
- NEVER mention GraphQL, SQL, APIs, query names, field names, table names, or any internal implementation detail.
- NEVER say things like "according to the data returned", "the query returned", "the database shows", "the API responded with", "I fetched", "based on the tool result".
- Present all data as factual analytics. Say "CV2 has 42,000 households" not "the query returned 42000 for households".
- NEVER reveal how data is obtained. You are an analyst, not an engineer.
- NEVER invent, estimate, or fabricate numbers. If a metric was not returned by a tool, do not mention it at all. Only use figures that appear verbatim in the tool results.

DATA TERMINOLOGY — use these labels precisely in your response:
- SPEND INDEX: A percentage value (e.g. 24.64 means 24.64%). It is the % of a source district's total spending that flows to the destination. NOT a £ amount. Never show spend index values with £ signs.
- TAM (Total Addressable Market): Monetary value in £. Total consumer spending potential of a district's residents. Comes from the "tam" field in getDistrictProfile.
- TOM (Total Obtainable Market): Monetary value in £. The spending flowing into a destination district. Each flow's "marketPotential" = sourceTAM × (spendIndex / 100).
- GDHI: £ per household per year. Comes from the "gdhi" field in getDistrictProfile.

CUSTOMER PROFILE PRESENTATION — when analysis involves destination mode demographics:
- Always distinguish: FOCUS AREA (spend index ≥1.0 — core customers) and WIDER AREA (spend index <1.0 — peripheral customers).
- For FOCUS AREA: describe aggregate demographic profile from source districts' profiles.
- For WIDER AREA: describe qualitatively (count only, no invented figures).
- NEVER describe the target district's own residents as its "customer profile".

RESPONSE FORMAT:
Always start your response with a single blockquote line — the key insight in one sentence (max 20 words):
> The single most important finding or actionable takeaway from the data.

Then continue with the full markdown analysis below it. The blockquote must always be the very first line.

NUMBER FORMATTING — always apply:
- £1,000,000,000+ → e.g. £1.2B
- £1,000,000+ → e.g. £390M
- £1,000+ → e.g. £4.7K
- Plain integers ≥ 1,000 → e.g. 17K, 42.3K, 1.2M
- Percentages and spend index → keep as-is (e.g. 24.6%, 1.03)
- GDHI is per-household annual £ — abbreviate the same way (e.g. £47.1K)

CHART AND TABLE RULES — NEVER VIOLATE:
- NEVER generate charts, graphs, mermaid diagrams, code blocks with chart data, or ASCII visualizations.
- NEVER reproduce raw data tables that simply list the same numbers already shown in the charts.
- NEVER offer to "redraw", "show in a different format", or ask about chart style.
- Focus on insight and interpretation — what the numbers mean, what stands out, what action to take.

REGION QUERIES — when the user mentions a city or region (London, Manchester, West Midlands, etc.):
- The system has already resolved the region to districts and fetched aggregated data.
- Present the aggregated profile directly. Do NOT ask the user to specify a district.
- Do NOT say "London is not a single district" — the region profile tool handles this automatically.
- IMPORTANT: getRegionProfile data is RESIDENT demographics — people who LIVE in the region.
  Always present it as "resident profile", never as "customer profile".
- getCustomerProfile data is CUSTOMER demographics — people who SPEND in the region (not residents).
  Present it as "customer profile" or "visitor profile", never as "resident profile".
- getRegionProfile data is RESIDENT demographics — people who LIVE in the region.
  Always present it as "resident profile", never as "customer profile".

VENUE LISTING — when tool results include venue data (listVenuesInDistrict):
- Present venues as a clean numbered or bulleted list with name, type, address if available.
- Do NOT say you "can't list venues" or redirect to spending data — the venues ARE in the tool results.
- Do NOT fabricate venues. Only list what is explicitly present in the tool results.
- Start with the blockquote insight (e.g. how many venues found, notable brands).

ERROR HANDLING — if tool results contain errors (HTTP errors, "Unauthorized", timeouts, empty arrays):
- Respond with a single short sentence: "The data couldn't be loaded — please try again."
- Do NOT ask the user to paste data, export files, or provide credentials.
- Do NOT explain what data you would need or what analysis you could run "once access is restored".
- Do NOT mention API errors, permissions, or internal systems.`;
}

// ─── Graph factory ────────────────────────────────────────────────────────────

export function createAgentGraph(token: string, mapContext?: MapContext) {
  const spatialTools = createSpatialTools(token);
  const dataTools    = createDataTools(token);

  const openRouterConfig = {
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://spendmap.app",
      "X-Title":      "SpendMap AI",
    },
  };
  const apiKey = process.env.OPENROUTER_API_KEY!;

  const supervisorModel = new ChatOpenAI({
    modelName:     process.env.OPENROUTER_SUPERVISOR_MODEL ?? process.env.OPENROUTER_MODEL,
    apiKey,
    configuration: openRouterConfig,
    temperature:   0,
    maxTokens:     50,
    streaming:     false,
  });

  const spatialModel = new ChatOpenAI({
    modelName:     process.env.OPENROUTER_MODEL,
    apiKey,
    configuration: openRouterConfig,
    temperature:   0,
    maxTokens:     800,
    streaming:     false,
  }).bindTools(spatialTools);

  const dataModel = new ChatOpenAI({
    modelName:     process.env.OPENROUTER_MODEL,
    apiKey,
    configuration: openRouterConfig,
    temperature:   0,
    maxTokens:     800,
    streaming:     false,
  }).bindTools(dataTools);

  const finalModel = new ChatOpenAI({
    modelName:     process.env.OPENROUTER_RESPOND_MODEL ?? process.env.OPENROUTER_MODEL,
    apiKey,
    configuration: openRouterConfig,
    temperature:   0,
    streaming:     true,
  });

  const spatialPrompt = buildSpatialPrompt(mapContext);
  const dataPrompt    = buildDataPrompt(mapContext);
  const finalPrompt   = buildFinalSystemPrompt(mapContext);

  // ── Routing schema ───────────────────────────────────────────────────────────
  const routingSchema = z.object({
    next: z.enum(["spatial", "data", "analysis", "final"]),
  });

  // ── Supervisor node ──────────────────────────────────────────────────────────
  async function supervisorNode(state: typeof SpendMapState.State) {
    const msgs = state.messages;
    const SPATIAL_TOOL_NAMES = new Set(["resolveDistricts", "resolveVenue", "getTravelTimeDistricts", "getDistrictsInRadius", "listVenuesInDistrict"]);
    const hasSpatialResults = msgs.some(
      m => m instanceof ToolMessage && SPATIAL_TOOL_NAMES.has((m as ToolMessage).name ?? ""),
    );

    // Deterministic pipeline gates — never let the LLM loop back to a completed stage
    if (hasSpatialResults && !state.dataAgentRan) return { next: "data" };
    if (state.dataAgentRan && !state.analysisComplete) return { next: "analysis" };
    if (state.analysisComplete) return { next: "final" };

    // Deterministic venue detection — always route to spatial for venue listing queries
    const lastHuman = msgs.filter(m => m instanceof HumanMessage).at(-1);
    const queryText = typeof lastHuman?.content === "string" ? lastHuman.content.toLowerCase() : "";
    const isVenueQuery = /shop|restaurant|cafe|pub|bar|gym|hotel|cinema|mall|centre|center|pharmacy|supermarket|venue|store|coffee|takeaway/.test(queryText);
    if (isVenueQuery && !hasSpatialResults) return { next: "spatial" };

    // LLM routing: only needed on the very first pass (nothing has run yet)
    // Decides: does this query need spatial resolution, or can we skip directly to data/final?
    const prompt = buildSupervisorPrompt(state);
    let next: string;

    try {
      const structured = supervisorModel.withStructuredOutput(routingSchema);
      const result = await structured.invoke([
        new SystemMessage(prompt),
        ...state.messages,
      ]);
      next = result.next;
    } catch {
      const raw = await supervisorModel.invoke([
        new SystemMessage(prompt),
        ...state.messages,
      ]);
      const content = typeof raw.content === "string" ? raw.content : "";
      const match   = content.match(/"next"\s*:\s*"(spatial|data|analysis|final)"/);
      next = match?.[1] ?? "data";
    }

    return { next };
  }

  // ── Spatial agent node ───────────────────────────────────────────────────────
  async function spatialAgentNode(state: typeof SpendMapState.State) {
    const messages = [new SystemMessage(spatialPrompt), ...state.messages];
    const response = await spatialModel.invoke(messages);
    return { messages: [response] };
  }

  function shouldContinueSpatial(state: typeof SpendMapState.State): "spatialTools" | "supervisor" {
    const last = state.messages.at(-1);
    if (last instanceof AIMessage && (last as AIMessage).tool_calls?.length) return "spatialTools";
    return "supervisor";
  }

  // ── Data agent node ──────────────────────────────────────────────────────────
  async function dataAgentNode(state: typeof SpendMapState.State) {
    const messages = [new SystemMessage(dataPrompt), ...state.messages];
    const response = await dataModel.invoke(messages);
    return { messages: [response], dataAgentRan: true };
  }

  function shouldContinueData(state: typeof SpendMapState.State): "dataTools" | "supervisor" {
    const last = state.messages.at(-1);
    if (last instanceof AIMessage && (last as AIMessage).tool_calls?.length) return "dataTools";
    return "supervisor";
  }

  // ── Analysis node (deterministic — no LLM) ───────────────────────────────────
  function analysisNode(state: typeof SpendMapState.State): { cardPlans: CardPlan[]; analysisComplete: boolean } {
    const cardPlans = computeAnalysis(state.messages);
    return { cardPlans, analysisComplete: true };
  }

  // ── Final node ───────────────────────────────────────────────────────────────
  async function finalNode(state: typeof SpendMapState.State) {
    // Pass only conversational messages to final: strip DONE signals and supervisor routing
    const cleanMessages = state.messages.filter(m =>
      m instanceof HumanMessage ||
      m instanceof ToolMessage  ||
      (m instanceof AIMessage && Array.isArray((m as AIMessage).tool_calls) && (m as AIMessage).tool_calls!.length > 0)
    );

    const response = await finalModel.invoke([new SystemMessage(finalPrompt), ...cleanMessages]);
    return { messages: [response] };
  }

  // ── Build graph ──────────────────────────────────────────────────────────────
  const graph = new StateGraph(SpendMapState)
    .addNode("supervisor",   supervisorNode)
    .addNode("spatialAgent", spatialAgentNode)
    .addNode("spatialTools", new ToolNode(spatialTools))
    .addNode("dataAgent",    dataAgentNode)
    .addNode("dataTools",    new ToolNode(dataTools))
    .addNode("analysis",     analysisNode)
    .addNode("final",        finalNode)
    .addEdge(START, "supervisor")
    .addConditionalEdges("supervisor", s => s.next, {
      spatial:  "spatialAgent",
      data:     "dataAgent",
      analysis: "analysis",
      final:    "final",
    })
    .addConditionalEdges("spatialAgent", shouldContinueSpatial, {
      spatialTools: "spatialTools",
      supervisor:   "supervisor",
    })
    .addEdge("spatialTools", "spatialAgent")
    .addConditionalEdges("dataAgent", shouldContinueData, {
      dataTools:  "dataTools",
      supervisor: "supervisor",
    })
    .addEdge("dataTools",  "dataAgent")
    .addEdge("analysis",   "final")
    .addEdge("final",      END)
    .compile();

  return graph;
}

// ─── Helper: thinking label per tool ─────────────────────────────────────────

export function toolThinkingLabel(toolName: string): string {
  const labels: Record<string, string> = {
    resolveDistricts:       "Resolving district names...",
    resolveVenue:           "Looking up venue location...",
    listVenuesInDistrict:   "Finding venues in district...",
    getDistrictsInRadius:   "Mapping districts in radius...",
    getTravelTimeDistricts: "Calculating travel time catchment...",
    getSpendingFlows:       "Fetching spending flows...",
    getDistrictProfile:     "Loading demographic profile...",
    getSpendingTrend:       "Calculating spending trend...",
    getCustomerProfile:     "Building customer profile...",
    getRegionProfile:       "Aggregating region profile...",
  };
  return labels[toolName] ?? `Running ${toolName}...`;
}
