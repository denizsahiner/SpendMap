// @ts-nocheck
"use client";

import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  memo,
} from "react";

// ── ChatComposer ──────────────────────────────────────────────────────────────
// Isolated component so typing never re-renders the parent tree.
const ChatComposer = memo(function ChatComposer({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value);
      resize();
    },
    [resize],
  );

  const handleSend = useCallback(() => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [value, disabled, onSend]);

  return (
    <div className="sm-agent-foot">
      <div className="sm-suggest-row">
        {[
          "Top flows for SW10",
          "List of shopping centers in W1B",
          "Analyse the customer profile for CV2",
        ].map((s) => (
          <button key={s} onClick={() => { setValue(s); setTimeout(resize, 0); }}>
            {s}
          </button>
        ))}
      </div>
      <div className="sm-composer">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={handleChange}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend())}
          placeholder="Ask about districts, trends, demographics…"
          disabled={disabled}
        />
        <button
          className="sm-send-btn"
          disabled={!value.trim() || disabled}
          onClick={handleSend}
        >
          <Send size={13} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
});
import {
  MapPin,
  Calendar,
  MessageSquare,
  Send,
  Maximize2,
  Minimize2,
  Layers,
  Bookmark,
  Settings,
  BarChart2,
  ArrowLeftRight,
  Briefcase,
  Download,
  Plus,
  Sparkles,
  BarChart3,
  Sun,
  Moon,
  FolderOpen,
  FolderPlus,
  Trash2,
  FileText,
  X,
  ChevronDown,
} from "lucide-react";
import postcodeNames from "@/public/postcode-names.json";
const nameMap = postcodeNames as Record<string, string>;
import type {
  ConsumerMetrics,
  DiffLocationItem,
  HouseholdFilter,
  HouseholdMetrics,
  HouseholdRow,
  MapType,
  Mode,
  PopulationRow,
  SpendingLocationItem,
} from "@/lib/types";
import type { ChatMessage, CardSpec } from "@/lib/agent/types";
import type { WorkspaceCard } from "./workspace-data-card";
import { workspaceSubCardToSpec } from "./workspace-data-card";
import {
  CardSpendSummary,
  CardSpendTrend,
  CardHousehold,
  CardGender,
  CardTopFlows,
  CardAllFlows,
  CardAgeDistribution,
  CardMarketOverview,
} from "./workspace-data-card";
import { AgentCard } from "./data-cards";
import { ReportBuilderModal } from "./report-builder-modal";

const TOOL_LABELS: Record<string, string> = {
  resolveDistricts:       "Location Lookup",
  resolveVenue:           "Venue Lookup",
  getSpendingFlows:       "Spending Flows",
  getDistrictProfile:     "District Profile",
  getSpendingTrend:       "Trend",
  compareDistricts:       "Comparison",
  getTopDistricts:        "Rankings",
  listVenuesInDistrict:   "Venues",
  getDistrictsInRadius:   "Radius Search",
  getTravelTimeDistricts: "Travel Time",
  getAreaZones:           "Area Zones",
  getMarketPotential:     "Market Potential",
  getInflowTAMSummary:    "Inflow TAM",
};
const toolLabel = (name: string) => TOOL_LABELS[name] ?? name;



function getPrevPeriod(
  year: number,
  quarter: string,
): { year: number; quarter: string } {
  if (quarter === "Q1") return { year: year - 1, quarter: "Q4" };
  return { year, quarter: `Q${parseInt(quarter[1]) - 1}` };
}

function relTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

function uid(): string {
  return (
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
  );
}

// ── Lightweight markdown renderer (no external deps) ──────────────────────────

function inlineRender(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**"))
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("*") && p.endsWith("*"))
      return <em key={i}>{p.slice(1, -1)}</em>;
    if (p.startsWith("`") && p.endsWith("`"))
      return (
        <code
          key={i}
          style={{
            fontFamily: "monospace",
            fontSize: "0.9em",
            background: "var(--sm-surface-3)",
            padding: "1px 4px",
            borderRadius: 3,
          }}
        >
          {p.slice(1, -1)}
        </code>
      );
    return p;
  });
}

function MarkdownText({ content }: { content: string }) {
  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^#{1,6}\s/.test(line)) {
      const level = line.match(/^(#+)/)?.[1].length ?? 1;
      const text = line.replace(/^#+\s/, "");
      const fs = level <= 2 ? 13 : 12;
      nodes.push(
        <div
          key={i}
          style={{
            fontWeight: 700,
            fontSize: fs,
            color: "var(--sm-fg-1)",
            marginTop: i === 0 ? 0 : 10,
            marginBottom: 3,
          }}
        >
          {inlineRender(text)}
        </div>,
      );
    } else if (/^[-*]\s/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(
          <li key={i}>{inlineRender(lines[i].replace(/^[-*]\s/, ""))}</li>,
        );
        i++;
      }
      nodes.push(
        <ul
          key={`ul-${i}`}
          style={{
            paddingLeft: 14,
            margin: "4px 0",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {items}
        </ul>,
      );
      continue;
    } else if (/^>\s?/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        items.push(<div key={i}>{inlineRender(lines[i].replace(/^>\s?/, ""))}</div>);
        i++;
      }
      nodes.push(
        <div
          key={`bq-${i}`}
          style={{
            borderLeft: "3px solid var(--sm-mint)",
            background: "var(--sm-mint-soft)",
            color: "var(--sm-mint-ink)",
            borderRadius: "0 6px 6px 0",
            padding: "7px 11px",
            fontSize: 12,
            fontWeight: 600,
            lineHeight: 1.5,
            margin: "0 0 8px 0",
          }}
        >
          {items}
        </div>,
      );
      continue;
    } else if (/^\d+\.\s/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(
          <li key={i}>{inlineRender(lines[i].replace(/^\d+\.\s/, ""))}</li>,
        );
        i++;
      }
      nodes.push(
        <ol
          key={`ol-${i}`}
          style={{
            paddingLeft: 16,
            margin: "4px 0",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {items}
        </ol>,
      );
      continue;
    } else if (line.trim() === "") {
      nodes.push(<div key={i} style={{ height: 6 }} />);
    } else {
      nodes.push(
        <div key={i} style={{ lineHeight: 1.55 }}>
          {inlineRender(line)}
        </div>,
      );
    }

    i++;
  }

  return <div style={{ fontSize: 12, color: "var(--sm-fg-2)" }}>{nodes}</div>;
}

// Bileşen Importları
import {
  MapTypeToggle } from "./map-type-toggle";
import { ModeToggle } from "./mode-toggle";
import { TimeSelector } from "./time-selector";
import { DistrictSearch } from "./district-search";
import { UKMap } from "./uk-map";

// --- LOCAL DB PLACEHOLDER ---
// The following client was previously AWS Amplify. 
// Refactor this to use your local database (e.g., Prisma, Kysely, etc.)
const client: any = {
  models: {
    ChatSession: { list: async () => ({ data: [] }), delete: async () => ({}) },
    SavedCard: { list: async () => ({ data: [] }), create: async () => ({ data: { id: "mock" } }), delete: async () => ({}) },
    Report: { list: async () => ({ data: [] }), create: async () => ({ data: { id: "mock" } }), update: async () => ({}), delete: async () => ({}) },
    Project: { list: async () => ({ data: [] }), create: async () => ({ data: { id: "mock", title: "Mock" } }) },
    ProjectCard: { list: async () => ({ data: [] }), create: async () => ({ data: { id: "mock" } }), delete: async () => ({}) },
    ChatMessage: { 
      listChatMessageBySessionId: async () => ({ data: [] }),
      create: async () => ({}),
      delete: async () => ({})
    },
    SpendRecord: {
      listSpendRecordByCardholderLocationAndYearPeriod: async () => ({ data: [] }),
      listSpendRecordByMerchantLocationAndYearPeriod: async () => ({ data: [] }),
    },
    PostcodeData: { list: async () => ({ data: [] }) },
    PopulationData: { list: async () => ({ data: [] }) },
    householdData: { list: async () => ({ data: [] }) },
  }
};

const signOut = async () => console.log("Sign out (no-op)");
const fetchAuthSession = async () => ({ tokens: { idToken: { toString: () => "local-token" } } });

export function SpendMapContainer() {
  // --- TEMEL STATELER ---
  const [mapType, setMapType] = useState<MapType>("standard");
  const [mode, setMode] = useState<Mode>("origin");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [fetchedDistrict, setFetchedDistrict] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // --- ZAMAN STATELERİ ---
  const [year, setYear] = useState(2023);
  const [quarter, setQuarter] = useState("Q1");
  const [endYear, setEndYear] = useState(2024);
  const [endQuarter, setEndQuarter] = useState("Q1");

  // --- VERİ STATELERİ (STANDART MOD) ---
  const [spendingItems, setSpendingItems] = useState<SpendingLocationItem[]>(
    [],
  );
  const [totalSpend, setTotalSpend] = useState<number | null>(null);
  const [top3, setTop3] = useState<SpendingLocationItem[]>([]);
  const [tam, setTam] = useState<number | null>(null);
  const [tom, setTom] = useState<number | null>(null);

  // --- VERİ STATELERİ (DIFFERENCE MOD) ---
  const [diffItems, setDiffItems] = useState<DiffLocationItem[]>([]);
  const [topPositive, setTopPositive] = useState<DiffLocationItem[]>([]);
  const [topNegative, setTopNegative] = useState<DiffLocationItem[]>([]);

  // --- POPULATION STATE ---
  const [allPopulationData, setAllPopulationData] = useState<
    Map<string, PopulationRow>
  >(new Map());

  // --- HOUSEHOLD STATE ---
  const [allHouseholdData, setAllHouseholdData] = useState<
    Map<string, HouseholdRow>
  >(new Map());

  // --- HOUSEHOLD FILTER ---
  const [selectedHouseholdFilter, setSelectedHouseholdFilter] =
    useState<HouseholdFilter | null>(null);

  // --- GEOJSON STATELERİ ---
  const [geojson, setGeojson] = useState<any>(null);
  const [geojsonLoading, setGeojsonLoading] = useState(true);

  // --- MAP / LAYOUT ---
  const [mapFading, setMapFading] = useState(false);
  const [mapCollapsed, setMapCollapsed] = useState(false);

  // --- WORKSPACE CARDS (manual query snapshots) ---
  const [workspaceCards, setWorkspaceCards] = useState<WorkspaceCard[]>([]);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [hiddenSubCards, setHiddenSubCards] = useState<Set<string>>(new Set());

  const hideSubCard = useCallback((cardId: string, type: string) => {
    setHiddenSubCards((prev) => {
      const next = new Set(prev);
      next.add(`${cardId}:${type}`);
      return next;
    });
  }, []);

  const isSubCardVisible = useCallback(
    (cardId: string, type: string) =>
      !hiddenSubCards.has(`${cardId}:${type}`),
    [hiddenSubCards],
  );

  // --- CARD FILTER ---
  const [cardFilter, setCardFilter] = useState<"both" | "manual" | "ai">(
    "both",
  );

  // --- THEME ---
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("sm-theme") as "dark" | "light") || "light";
    }
    return "light";
  });
  useEffect(() => {
    localStorage.setItem("sm-theme", theme);
  }, [theme]);

  // --- TOAST ---
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 2400);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // --- AGENT CHAT ---
  const chatEndRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string>(`session-${Date.now()}`);
  const dbSessionIdRef = useRef<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isAgentLoading, setIsAgentLoading] = useState(false);
  const [agentCards, setAgentCards] = useState<CardSpec[]>([]);
  const [thinkingText, setThinkingText] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [shownCards, setShownCards] = useState<Set<string>>(new Set());
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<
    Array<{ id: string; title: string; updatedAt?: string | null }>
  >([]);
  const [showSessions, setShowSessions] = useState(false);
  const [savedCards, setSavedCards] = useState<
    Array<{ id: string; title: string; cardSpec: string }>
  >([]);
  const [savedCardIds, setSavedCardIds] = useState<Set<string>>(new Set());
  const [activeRailPanel, setActiveRailPanel] = useState<"library" | "reports" | null>(null);
  const [showReportBuilder, setShowReportBuilder] = useState(false);
  const [openReportInitial, setOpenReportInitial] = useState<{ id: string; title: string; markdown: string } | undefined>(undefined);
  const [savedReports, setSavedReports] = useState<Array<{ id: string; title: string; markdown: string; createdAt: string }>>([]);
  const [projects, setProjects] = useState<
    Array<{ id: string; title: string }>
  >([]);
  const [projectCards, setProjectCards] = useState<Map<string, Set<string>>>(
    new Map(),
  );
  const [selectedLibraryProject, setSelectedLibraryProject] = useState<
    string | null
  >(null);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [showNewProjectInput, setShowNewProjectInput] = useState(false);

  // 1. GeoJSON Yükleme
  useEffect(() => {
    setGeojsonLoading(true);
    fetch("/uk-districts-simplified.geojson")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setGeojson(data);
        setGeojsonLoading(false);
      })
      .catch(() => setGeojsonLoading(false));
  }, []);

  // Chat sessions yükleme
  useEffect(() => {
    client.models.ChatSession.list({ limit: 20 })
      .then(({ data }) => {
        const sorted = (data ?? [])
          .filter(Boolean)
          .sort((a, b) => ((b.updatedAt ?? "") > (a.updatedAt ?? "") ? 1 : -1));
        setSessions(
          sorted.map((s) => ({
            id: s.id,
            title: s.title,
            updatedAt: s.updatedAt,
          })),
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    client.models.SavedCard.list({ limit: 50 })
      .then(({ data }) => {
        const items = (data ?? []).filter(Boolean);
        setSavedCards(
          items.map((c) => ({
            id: c.id,
            title: c.title,
            cardSpec: c.cardSpec,
          })),
        );
        setSavedCardIds(new Set(items.map((c) => c.id)));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeRailPanel !== "reports") return;
    if (showReportBuilder) return;
    client.models.Report?.list({ limit: 100 })
      ?.then(({ data }) => {
        setSavedReports(
          (data ?? [])
            .filter(Boolean)
            .map((r) => ({ id: r.id, title: r.title, markdown: r.markdown, createdAt: r.createdAt ?? "" }))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        );
      })
      .catch(() => {});
  }, [activeRailPanel, showReportBuilder]);

  const handleSaveReport = useCallback(
    async (id: string | null, title: string, markdown: string): Promise<string | null> => {
      if (id) {
        await client.models.Report?.update({ id, title, markdown }).catch(() => {});
        setSavedReports((prev) => prev.map((r) => (r.id === id ? { ...r, title, markdown } : r)));
        return id;
      } else {
        const result = await client.models.Report?.create({ title, markdown }).catch(() => null);
        const newId = result?.data?.id ?? null;
        if (newId) {
          setSavedReports((prev) => [{ id: newId, title, markdown, createdAt: new Date().toISOString() }, ...prev]);
        }
        return newId;
      }
    },
    [],
  );

  const handleDeleteReport = useCallback(async (id: string) => {
    await client.models.Report?.delete({ id }).catch(() => {});
    setSavedReports((prev) => prev.filter((r) => r.id !== id));
  }, []);

  useEffect(() => {
    client.models.Project?.list({ limit: 50 })
      .then(({ data }) => {
        setProjects(
          (data ?? [])
            .filter(Boolean)
            .map((p) => ({ id: p.id, title: p.title })),
        );
      })
      .catch(() => {});
    client.models.ProjectCard?.list({ limit: 200 })
      .then(({ data }) => {
        const map = new Map<string, Set<string>>();
        (data ?? []).filter(Boolean).forEach((pc) => {
          if (!map.has(pc.projectId)) map.set(pc.projectId, new Set());
          map.get(pc.projectId)!.add(pc.cardId);
        });
        setProjectCards(map);
      })
      .catch(() => {});
  }, []);

  const loadSession = useCallback(async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    dbSessionIdRef.current = sessionId;
    setShowSessions(false);
    const { data: msgs } =
      await client.models.ChatMessage.listChatMessageBySessionId(
        { sessionId },
        { limit: 200 },
      );
    const sorted = (msgs ?? [])
      .filter(Boolean)
      .sort((a, b) => ((a.createdAt ?? "") < (b.createdAt ?? "") ? -1 : 1));
    const loaded: ChatMessage[] = sorted.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant" | "tool",
      content: m.content,
      cards: m.cardSpecs ? (JSON.parse(m.cardSpecs) as CardSpec[]) : undefined,
      toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : undefined,
      toolCallId: m.toolCallId ?? undefined,
      toolName: m.toolName ?? undefined,
    }));
    setChatMessages(loaded);
    const restored: CardSpec[] = [];
    loaded.forEach((m) => {
      if (m.cards) restored.push(...m.cards);
    });
    setAgentCards(restored);
  }, []);

  const deleteSession = useCallback(async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { data: msgs } = await client.models.ChatMessage.listChatMessageBySessionId(
        { sessionId },
        { limit: 500 },
      );
      await Promise.all((msgs ?? []).map((m) => client.models.ChatMessage.delete({ id: m.id })));
      await client.models.ChatSession.delete({ id: sessionId });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (dbSessionIdRef.current === sessionId) {
        setCurrentSessionId(null);
        dbSessionIdRef.current = null;
        setChatMessages([]);
        setAgentCards([]);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const startNewChat = useCallback(() => {
    setCurrentSessionId(null);
    dbSessionIdRef.current = null;
    setChatMessages([]);
    setAgentCards([]);
    setShowSessions(false);
  }, []);

  const createProject = useCallback(async () => {
    const title = newProjectTitle.trim();
    if (!title || !client.models.Project) return;
    const { data } = await client.models.Project.create({ title });
    if (data) {
      setProjects((prev) => [...prev, { id: data.id, title: data.title }]);
      setNewProjectTitle("");
      setShowNewProjectInput(false);
      setToastMsg(`Project "${title}" created`);
    }
  }, [newProjectTitle]);

  const toggleCardInProject = useCallback(
    async (cardId: string, projectId: string) => {
      if (!client.models.ProjectCard) return;
      const inProject = projectCards.get(projectId)?.has(cardId);
      if (inProject) {
        const { data: existing } = await client.models.ProjectCard.list({
          filter: { projectId: { eq: projectId }, cardId: { eq: cardId } },
          limit: 1,
        });
        const record = existing?.[0];
        if (record) {
          await client.models.ProjectCard.delete({ id: record.id });
          setProjectCards((prev) => {
            const next = new Map(prev);
            next.get(projectId)?.delete(cardId);
            return next;
          });
        }
      } else {
        const { data } = await client.models.ProjectCard.create({
          projectId,
          cardId,
        });
        if (data) {
          setProjectCards((prev) => {
            const next = new Map(prev);
            if (!next.has(projectId)) next.set(projectId, new Set());
            next.get(projectId)!.add(cardId);
            return next;
          });
        }
      }
    },
    [projectCards],
  );

  const saveCard = useCallback(
    async (card: CardSpec, sourceSessionId?: string) => {
      const { data } = await client.models.SavedCard.create({
        title: card.title,
        cardSpec: JSON.stringify(card),
        sourceSessionId,
      });
      if (data) {
        setSavedCards((prev) => [
          ...prev,
          { id: data.id, title: data.title, cardSpec: data.cardSpec },
        ]);
        setSavedCardIds((prev) => new Set([...prev, data.id]));
        setToastMsg(`"${card.title}" saved to library`);
      }
    },
    [],
  );

  const saveWorkspaceCard = useCallback(
    async (card: WorkspaceCard, subType: string) => {
      const spec = workspaceSubCardToSpec(card, subType);
      if (!spec) return;
      await saveCard(spec);
    },
    [saveCard],
  );

  const removeFromLibrary = useCallback(async (savedCardId: string) => {
    await client.models.SavedCard.delete({ id: savedCardId });
    setSavedCards((prev) => prev.filter((c) => c.id !== savedCardId));
    setSavedCardIds((prev) => {
      const next = new Set(prev);
      next.delete(savedCardId);
      return next;
    });
    // also remove from all project memberships locally
    setProjectCards((prev) => {
      const next = new Map(prev);
      next.forEach((cardSet, projectId) => {
        if (cardSet.has(savedCardId)) {
          const updated = new Set(cardSet);
          updated.delete(savedCardId);
          next.set(projectId, updated);
        }
      });
      return next;
    });
  }, []);

  // 2. Dinamik Veri Çekme
  const fetchData = useCallback(async () => {
    if (!selectedDistrict) return;
    setIsLoading(true);
    setSelectedHouseholdFilter(null);

    try {
      const queryRecords = async (y: number, p: string) => {
        const yp = `${y}#${p}`;
        const allItems: {
          location: string;
          spend: number;
          cardholderSpend?: number;
        }[] = [];
        let nextToken: string | null = null;

        do {
          if (mode === "origin") {
            const result: Awaited<
              ReturnType<
                typeof client.models.SpendRecord.listSpendRecordByCardholderLocationAndYearPeriod
              >
            > =
              await client.models.SpendRecord.listSpendRecordByCardholderLocationAndYearPeriod(
                {
                  cardholderLocation: selectedDistrict,
                  yearPeriod: { eq: yp },
                },
                { limit: 2500, nextToken },
              );
            (result.data ?? [])
              .filter((r): r is NonNullable<typeof r> => r !== null)
              .forEach((r) => {
                allItems.push({
                  location: r.merchantLocation as string,
                  spend: r.cardholderIndexSpend as number,
                });
              });
            nextToken = result.nextToken ?? null;
          } else {
            const result: Awaited<
              ReturnType<
                typeof client.models.SpendRecord.listSpendRecordByMerchantLocationAndYearPeriod
              >
            > =
              await client.models.SpendRecord.listSpendRecordByMerchantLocationAndYearPeriod(
                { merchantLocation: selectedDistrict, yearPeriod: { eq: yp } },
                { limit: 2500, nextToken },
              );
            (result.data ?? [])
              .filter((r): r is NonNullable<typeof r> => r !== null)
              .forEach((r) => {
                allItems.push({
                  location: r.cardholderLocation as string,
                  spend: r.merchantIndexSpend as number,
                  cardholderSpend: r.cardholderIndexSpend as number,
                });
              });
            nextToken = result.nextToken ?? null;
          }
        } while (nextToken);

        return allItems;
      };

      // Tüm PostcodeData'yı tek seferde çek
      const allPostcodeData: Map<string, number> = new Map();
      let pcNextToken: string | null = null;
      while (true) {
        // eslint-disable-next-line no-await-in-loop, @typescript-eslint/no-explicit-any
        const pcResult: any = await client.models.PostcodeData.list({
          limit: 2000,
          ...(pcNextToken ? { nextToken: pcNextToken } : {}),
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (pcResult.data ?? []).forEach((e: any) => {
          if (e) allPostcodeData.set(e.postcode, e.tam);
        });
        pcNextToken = pcResult.nextToken ?? null;
        if (!pcNextToken) break;
      }

      if (mode === "origin")
        setTam(allPostcodeData.get(selectedDistrict) ?? null);

      // PopulationData
      const popMap: Map<string, PopulationRow> = new Map();
      let popNext: string | null = null;
      while (true) {
        // eslint-disable-next-line no-await-in-loop, @typescript-eslint/no-explicit-any
        const popResult: any = await client.models.PopulationData.list({
          limit: 2000,
          ...(popNext ? { nextToken: popNext } : {}),
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (popResult.data ?? []).forEach((e: any) => {
          if (e) {
            const pc = (e.postcode as string)?.replace(/\s+/g, "").toUpperCase();
            if (!pc) return;
            popMap.set(pc, {
              postcode: pc,
              age_0_15_f: e.age_0_15_f ?? 0,
              age_16_24_f: e.age_16_24_f ?? 0,
              age_25_34_f: e.age_25_34_f ?? 0,
              age_35_49_f: e.age_35_49_f ?? 0,
              age_50_64_f: e.age_50_64_f ?? 0,
              over_65_f: e.over_65_f ?? 0,
              age_0_15_m: e.age_0_15_m ?? 0,
              age_16_24_m: e.age_16_24_m ?? 0,
              age_25_34_m: e.age_25_34_m ?? 0,
              age_35_49_m: e.age_35_49_m ?? 0,
              age_50_64_m: e.age_50_64_m ?? 0,
              over_65_m: e.over_65_m ?? 0,
              total_population: e.total_population ?? 0,
            });
          }
        });
        popNext = popResult.nextToken ?? null;
        if (!popNext) break;
      }
      setAllPopulationData(popMap);

      // HouseholdData
      const hhMap: Map<string, HouseholdRow> = new Map();
      let hhNext: string | null = null;
      while (true) {
        // eslint-disable-next-line no-await-in-loop, @typescript-eslint/no-explicit-any
        const hhResult: any = await client.models.householdData.list({
          limit: 2000,
          ...(hhNext ? { nextToken: hhNext } : {}),
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (hhResult.data ?? []).forEach((e: any) => {
          if (e)
            hhMap.set(e.postcode, {
              postcode: e.postcode,
              families_with_children: e.families_with_children ?? 0,
              over_66: e.over_66 ?? 0,
              students: e.students ?? 0,
              working_professionals: e.working_professionals ?? 0,
              total_households: e.total_households ?? 0,
            });
        });
        hhNext = hhResult.nextToken ?? null;
        if (!hhNext) break;
      }
      setAllHouseholdData(hhMap);

      if (mapType === "standard") {
        const prevPeriod = getPrevPeriod(year, quarter);
        const [records, prevYearRecords, prevPeriodRecords] = await Promise.all(
          [
            queryRecords(year, quarter),
            queryRecords(year - 1, quarter),
            queryRecords(prevPeriod.year, prevPeriod.quarter),
          ],
        );

        const filtered = records.filter(
          (r) => r.location.toUpperCase() !== "UNKNOWN",
        );
        const total = filtered.reduce((sum, r) => sum + r.spend, 0);
        const sorted = [...filtered].sort((a, b) => b.spend - a.spend);

        const prevYearMap = new Map(
          prevYearRecords.map((r) => [r.location, r.spend]),
        );
        const prevPeriodMap = new Map(
          prevPeriodRecords.map((r) => [r.location, r.spend]),
        );

        const enrichedTop3 = sorted.slice(0, 3).map((r) => ({
          ...r,
          prev_year_spend: prevYearMap.get(r.location) ?? 0,
          prev_period_spend: prevPeriodMap.get(r.location) ?? 0,
        }));

        setTotalSpend(total);
        setTop3(enrichedTop3);
        setFetchedDistrict(selectedDistrict);

        let calculatedTom: number | null = null;
        let enrichedItems = filtered;
        let totalTamDestination: number | null = null;
        if (mode === "destination") {
          totalTamDestination = filtered.reduce((sum, r) => {
            return sum + (allPostcodeData.get(r.location) ?? 0);
          }, 0);
          setTam(totalTamDestination > 0 ? totalTamDestination : null);

          calculatedTom = filtered.reduce((sum, r) => {
            const originTam = allPostcodeData.get(r.location) ?? 0;
            return sum + originTam * ((r.cardholderSpend ?? 0) / 100);
          }, 0);
          enrichedItems = filtered.map((r) => ({
            ...r,
            tam: allPostcodeData.get(r.location) ?? 0,
            tom: (allPostcodeData.get(r.location) ?? 0) * ((r.cardholderSpend ?? 0) / 100),
          }));
          setTom(calculatedTom);
          setSpendingItems(enrichedItems);
        } else {
          setSpendingItems(filtered);
          setTom(null);
        }

        // Inline consumer metrics snapshot
        let snapshotConsumerMetrics: ConsumerMetrics | null = null;
        if (mode === "destination") {
          let totalConsumers = 0,
            obtainable = 0,
            female = 0,
            male = 0;
          let a0_15 = 0,
            a16_24 = 0,
            a25_34 = 0,
            a35_49 = 0,
            a50_64 = 0,
            a65 = 0;
          enrichedItems.forEach((item) => {
            const pop = popMap.get(item.location);
            if (!pop) return;
            const share = (item.cardholderSpend ?? 0) / 100;
            totalConsumers += pop.total_population;
            obtainable += pop.total_population * share;
            female +=
              (pop.age_0_15_f +
                pop.age_16_24_f +
                pop.age_25_34_f +
                pop.age_35_49_f +
                pop.age_50_64_f +
                pop.over_65_f) *
              share;
            male +=
              (pop.age_0_15_m +
                pop.age_16_24_m +
                pop.age_25_34_m +
                pop.age_35_49_m +
                pop.age_50_64_m +
                pop.over_65_m) *
              share;
            a0_15 += (pop.age_0_15_f + pop.age_0_15_m) * share;
            a16_24 += (pop.age_16_24_f + pop.age_16_24_m) * share;
            a25_34 += (pop.age_25_34_f + pop.age_25_34_m) * share;
            a35_49 += (pop.age_35_49_f + pop.age_35_49_m) * share;
            a50_64 += (pop.age_50_64_f + pop.age_50_64_m) * share;
            a65 += (pop.over_65_f + pop.over_65_m) * share;
          });
          snapshotConsumerMetrics = {
            totalConsumers: Math.round(totalConsumers),
            obtainableConsumers: Math.round(obtainable),
            genderBreakdown: {
              female: Math.round(female),
              male: Math.round(male),
            },
            ageBreakdown: {
              age_0_15: Math.round(a0_15),
              age_16_24: Math.round(a16_24),
              age_25_34: Math.round(a25_34),
              age_35_49: Math.round(a35_49),
              age_50_64: Math.round(a50_64),
              over_65: Math.round(a65),
            },
          };
        }

        // Inline household metrics snapshot
        let snapshotHouseholdMetrics: HouseholdMetrics | null = null;
        if (mode === "origin") {
          const hh = hhMap.get(selectedDistrict);
          if (hh)
            snapshotHouseholdMetrics = {
              familiesWithChildren: hh.families_with_children,
              over66: hh.over_66,
              students: hh.students,
              workingProfessionals: hh.working_professionals,
              totalHouseholds: hh.total_households,
            };
        } else {
          let families = 0,
            over66 = 0,
            students = 0,
            working = 0,
            total_hh = 0;
          enrichedItems.forEach((item) => {
            const hh = hhMap.get(item.location);
            if (!hh) return;
            const share = (item.cardholderSpend ?? 0) / 100;
            families += hh.families_with_children * share;
            over66 += hh.over_66 * share;
            students += hh.students * share;
            working += hh.working_professionals * share;
            total_hh += hh.total_households * share;
          });
          snapshotHouseholdMetrics = {
            familiesWithChildren: Math.round(families),
            over66: Math.round(over66),
            students: Math.round(students),
            workingProfessionals: Math.round(working),
            totalHouseholds: Math.round(total_hh),
          };
        }


        const originPopRow =
          mode === "origin" ? popMap.get(selectedDistrict) : undefined;
        const originPopBreakdown = originPopRow
          ? {
              age_0_15: originPopRow.age_0_15_f + originPopRow.age_0_15_m,
              age_16_24: originPopRow.age_16_24_f + originPopRow.age_16_24_m,
              age_25_34: originPopRow.age_25_34_f + originPopRow.age_25_34_m,
              age_35_49: originPopRow.age_35_49_f + originPopRow.age_35_49_m,
              age_50_64: originPopRow.age_50_64_f + originPopRow.age_50_64_m,
              over_65: originPopRow.over_65_f + originPopRow.over_65_m,
              female:
                originPopRow.age_0_15_f +
                originPopRow.age_16_24_f +
                originPopRow.age_25_34_f +
                originPopRow.age_35_49_f +
                originPopRow.age_50_64_f +
                originPopRow.over_65_f,
              male:
                originPopRow.age_0_15_m +
                originPopRow.age_16_24_m +
                originPopRow.age_25_34_m +
                originPopRow.age_35_49_m +
                originPopRow.age_50_64_m +
                originPopRow.over_65_m,
            }
          : null;

        // Snapshot as a WorkspaceCard
        const distLabel = nameMap[selectedDistrict]
          ? `${selectedDistrict} · ${nameMap[selectedDistrict]}`
          : selectedDistrict;
        const card: WorkspaceCard = {
          id: uid(),
          source: "manual",
          district: selectedDistrict,
          districtLabel: distLabel,
          year,
          quarter,
          mode,
          mapType: "standard",
          createdAt: Date.now(),
          totalSpend: total,
          top3: enrichedTop3 as SpendingLocationItem[],
          spendingItemCount: filtered.length,
          allItems: enrichedItems,
          tam: mode === "destination" ? totalTamDestination : (allPostcodeData.get(selectedDistrict) ?? null),
          tom: calculatedTom,
          population: originPopBreakdown
            ? originPopBreakdown.female + originPopBreakdown.male
            : popMap.get(selectedDistrict)?.total_population ?? null,
          householdMetrics: snapshotHouseholdMetrics,
          consumerMetrics: snapshotConsumerMetrics,
          originPopBreakdown,
        };
        setWorkspaceCards((prev) => [card, ...prev]);
        setActiveCardId(card.id);
        setToastMsg(`Pinned ${selectedDistrict} as a card`);
      } else {
        const [startRecordsRaw, endRecordsRaw] = await Promise.all([
          queryRecords(year, quarter),
          queryRecords(endYear, endQuarter),
        ]);

        const startRecords = startRecordsRaw.filter(
          (r) => r.location.toUpperCase() !== "UNKNOWN",
        );
        const endRecords = endRecordsRaw.filter(
          (r) => r.location.toUpperCase() !== "UNKNOWN",
        );

        const startMap = new Map(
          startRecords.map((r) => [r.location, r.spend]),
        );
        const diff: DiffLocationItem[] = endRecords.map((r) => ({
          location: r.location,
          start_spend: startMap.get(r.location) ?? 0,
          end_spend: r.spend,
          spend_diff: r.spend - (startMap.get(r.location) ?? 0),
        }));

        const sortedDiff = [...diff].sort(
          (a, b) => b.spend_diff - a.spend_diff,
        );
        setDiffItems(diff);
        setTopPositive(sortedDiff.filter((r) => r.spend_diff > 0).slice(0, 3));
        setTopNegative(
          [...sortedDiff]
            .reverse()
            .filter((r) => r.spend_diff < 0)
            .slice(0, 3),
        );
        setFetchedDistrict(selectedDistrict);

        // Snapshot as a WorkspaceCard
        const distLabel = nameMap[selectedDistrict]
          ? `${selectedDistrict} · ${nameMap[selectedDistrict]}`
          : selectedDistrict;
        const topPos = sortedDiff.filter((r) => r.spend_diff > 0).slice(0, 3);
        const topNeg = [...sortedDiff]
          .reverse()
          .filter((r) => r.spend_diff < 0)
          .slice(0, 3);
        const top3Diff = topPos.slice(0, 3).map((d) => ({
          location: d.location,
          spend: d.spend_diff,
        })) as SpendingLocationItem[];
        const allDiffItems = diff.map((d) => ({
          location: d.location,
          spend: d.spend_diff,
        })) as SpendingLocationItem[];
        const card: WorkspaceCard = {
          id: uid(),
          source: "manual",
          district: selectedDistrict,
          districtLabel: distLabel,
          year,
          quarter,
          mode,
          mapType: "difference",
          createdAt: Date.now(),
          totalSpend: diff.reduce((s, d) => s + d.spend_diff, 0),
          top3: top3Diff,
          spendingItemCount: diff.length,
          allItems: allDiffItems,
          tam: null,
          tom: null,
          population: popMap.get(selectedDistrict)?.total_population ?? null,
          householdMetrics: null,
          consumerMetrics: null,
          topPositive: topPos,
          topNegative: topNeg,
        };
        setWorkspaceCards((prev) => [card, ...prev]);
        setActiveCardId(card.id);
        setToastMsg(`Pinned ${selectedDistrict} difference card`);
      }
    } catch (err) {
      console.error("fetchData error:", err);
    } finally {
      setMapFading(true);
      setIsLoading(false);
      setTimeout(() => setMapFading(false), 320);
    }
  }, [selectedDistrict, mode, year, quarter, endYear, endQuarter, mapType]);

  // Agent chat — send message via SSE
  const sendMessage = useCallback(async (text: string) => {
    if (!text || isAgentLoading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setIsAgentLoading(true);
    setThinkingText("Thinking...");

    try {
      // Session oluştur ya da mevcut session'ı kullan
      let sid = dbSessionIdRef.current;
      if (!sid) {
        try {
          const { data: newSession } = await client.models.ChatSession.create({
            title: text.slice(0, 60),
          });
          if (newSession?.id) {
            sid = newSession.id;
            dbSessionIdRef.current = sid;
            setCurrentSessionId(sid);
            setSessions((prev) => [
              {
                id: newSession.id,
                title: newSession.title,
                updatedAt: newSession.updatedAt,
              },
              ...prev,
            ]);
          }
        } catch {
          /* schema henüz deploy edilmemiş olabilir */
        }
      }

      // Kullanıcı mesajını kaydet
      if (sid) {
        client.models.ChatMessage.create({
          sessionId: sid,
          role: "user",
          content: text,
        }).catch(() => {});
      }

      const authSession = await fetchAuthSession();
      const token = authSession.tokens?.idToken?.toString() ?? "";
      // History: sadece user + final assistant mesajları (tool/intermediate assistant dahil edilmez)
      const history = chatMessages
        .filter(
          (m) =>
            m.role !== "tool" &&
            !(m.role === "assistant" && m.toolCalls?.length),
        )
        .slice(-30)
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      const agentEndpoint = process.env.NEXT_PUBLIC_AGENT_FUNCTION_URL ?? "/api/agent";
      const response = await fetch(agentEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          token,
          sessionId: sessionIdRef.current,
          mapContext: {
            currentDistrict: fetchedDistrict,
            currentPeriod: `${year}#${quarter}`,
            currentMode: mode,
          },
          history,
        }),
      });

      if (!response.ok) throw new Error(`Agent request failed (${response.status})`);
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const lines = part.split("\n");
          const eventLine = lines.find((l) => l.startsWith("event:"));
          const dataLine = lines.find((l) => l.startsWith("data:"));
          if (!eventLine || !dataLine) continue;
          const event = eventLine.replace("event:", "").trim();
          const data = JSON.parse(dataLine.replace("data:", "").trim());

          if (event === "delta") {
            setThinkingText(null);
            setStreamingContent((prev) => (prev ?? "") + (data.text as string));
          } else if (event === "thinking") {
            setThinkingText(data.text);
          } else if (event === "tool_calls") {
            const tcMsg: ChatMessage = {
              id: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              role: "assistant",
              content: (data.content as string) ?? "",
              toolCalls: data.toolCalls,
            };
            setChatMessages((prev) => [...prev, tcMsg]);
            const activeSid = dbSessionIdRef.current;
            if (activeSid) {
              client.models.ChatMessage.create({
                sessionId: activeSid,
                role: "assistant",
                content: tcMsg.content,
                toolCalls: JSON.stringify(data.toolCalls),
              }).catch(() => {});
            }
          } else if (event === "tool_result") {
            const trMsg: ChatMessage = {
              id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              role: "tool",
              content: data.content as string,
              toolCallId: data.toolCallId as string,
              toolName: data.toolName as string,
            };
            setChatMessages((prev) => [...prev, trMsg]);
            const activeSid = dbSessionIdRef.current;
            if (activeSid) {
              client.models.ChatMessage.create({
                sessionId: activeSid,
                role: "tool",
                content: trMsg.content,
                toolCallId: trMsg.toolCallId,
                toolName: trMsg.toolName,
              }).catch(() => {});
            }
          } else if (event === "cards") {
            setStreamingContent(null);
            const assistantMsg: ChatMessage = {
              id: `a-${Date.now()}`,
              role: "assistant",
              content: (data.message as string) || "",
              cards: (data.cards as CardSpec[]) ?? [],
              toolsUsed: (data.toolsUsed as string[]) ?? [],
            };
            setChatMessages((msgs) => [...msgs, assistantMsg]);
            const activeSid = dbSessionIdRef.current;
            if (activeSid) {
              client.models.ChatMessage.create({
                sessionId: activeSid,
                role: "assistant",
                content: assistantMsg.content,
                cardSpecs: assistantMsg.cards?.length
                  ? JSON.stringify(assistantMsg.cards)
                  : undefined,
              }).catch(() => {});
            }
            if ((data.cards as CardSpec[])?.length) {
              setAgentCards((existing) => {
                const existingIds = new Set(existing.map((c) => c.id));
                const newCards = (data.cards as CardSpec[])
                  .map((c) => ({
                    ...c,
                    id: `${c.id}-${Math.random().toString(36).slice(2, 8)}`,
                  }))
                  .filter((c) => !existingIds.has(c.id));
                return newCards.length ? [...existing, ...newCards] : existing;
              });
            }
          } else if (event === "error") {
            setChatMessages((prev) => [
              ...prev,
              {
                id: `err-${Date.now()}`,
                role: "assistant",
                content: `Error: ${data.message}`,
              },
            ]);
          }
        }
      }
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `Something went wrong: ${String(err)}`,
        },
      ]);
    } finally {
      setIsAgentLoading(false);
      setThinkingText(null);
      setStreamingContent(null);
    }
  }, [
    chatMessages,
    isAgentLoading,
    fetchedDistrict,
    year,
    quarter,
    mode,
  ]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, thinkingText]);

  // 3. Haritaya Verilecek Map Nesnesini Moda Göre Seç
  const spendingMap = useMemo(() => {
    if (mapType === "standard")
      return new Map(
        spendingItems.map((item) => [item.location, Number(item.spend)]),
      );
    return new Map(
      diffItems.map((item) => [item.location, Number(item.spend_diff)]),
    );
  }, [spendingItems, diffItems, mapType]);

  const householdSpendingMap = useMemo<Map<string, number> | null>(() => {
    if (
      !selectedHouseholdFilter ||
      mode !== "destination" ||
      spendingItems.length === 0
    )
      return null;
    const out = new Map<string, number>();
    spendingItems.forEach((item) => {
      if (!item.spend) return;
      const hh = allHouseholdData.get(item.location);
      if (!hh || hh.total_households === 0) return;
      let count = 0;
      if (selectedHouseholdFilter === "families")
        count = hh.families_with_children;
      else if (selectedHouseholdFilter === "over66") count = hh.over_66;
      else if (selectedHouseholdFilter === "students") count = hh.students;
      else if (selectedHouseholdFilter === "working")
        count = hh.working_professionals;
      out.set(item.location, (count / hh.total_households) * 2);
    });
    return out;
  }, [selectedHouseholdFilter, mode, spendingItems, allHouseholdData]);

  // Consumer Metrics
  const consumerMetrics = useMemo<ConsumerMetrics | null>(() => {
    if (
      mode !== "destination" ||
      mapType !== "standard" ||
      spendingItems.length === 0
    )
      return null;
    let totalConsumers = 0,
      obtainable = 0,
      female = 0,
      male = 0;
    let a0_15 = 0,
      a16_24 = 0,
      a25_34 = 0,
      a35_49 = 0,
      a50_64 = 0,
      a65 = 0;
    spendingItems.forEach((item) => {
      const pop = allPopulationData.get(item.location);
      if (!pop) return;
      const share = (item.cardholderSpend ?? 0) / 100;
      totalConsumers += pop.total_population;
      obtainable += pop.total_population * share;
      female +=
        (pop.age_0_15_f +
          pop.age_16_24_f +
          pop.age_25_34_f +
          pop.age_35_49_f +
          pop.age_50_64_f +
          pop.over_65_f) *
        share;
      male +=
        (pop.age_0_15_m +
          pop.age_16_24_m +
          pop.age_25_34_m +
          pop.age_35_49_m +
          pop.age_50_64_m +
          pop.over_65_m) *
        share;
      a0_15 += (pop.age_0_15_f + pop.age_0_15_m) * share;
      a16_24 += (pop.age_16_24_f + pop.age_16_24_m) * share;
      a25_34 += (pop.age_25_34_f + pop.age_25_34_m) * share;
      a35_49 += (pop.age_35_49_f + pop.age_35_49_m) * share;
      a50_64 += (pop.age_50_64_f + pop.age_50_64_m) * share;
      a65 += (pop.over_65_f + pop.over_65_m) * share;
    });
    return {
      totalConsumers: Math.round(totalConsumers),
      obtainableConsumers: Math.round(obtainable),
      genderBreakdown: { female: Math.round(female), male: Math.round(male) },
      ageBreakdown: {
        age_0_15: Math.round(a0_15),
        age_16_24: Math.round(a16_24),
        age_25_34: Math.round(a25_34),
        age_35_49: Math.round(a35_49),
        age_50_64: Math.round(a50_64),
        over_65: Math.round(a65),
      },
    };
  }, [spendingItems, allPopulationData, mode, mapType]);

  const householdMetrics = useMemo<HouseholdMetrics | null>(() => {
    if (mapType !== "standard" || allHouseholdData.size === 0) return null;
    if (mode === "origin") {
      const hh = allHouseholdData.get(fetchedDistrict);
      if (!hh) return null;
      return {
        familiesWithChildren: hh.families_with_children,
        over66: hh.over_66,
        students: hh.students,
        workingProfessionals: hh.working_professionals,
        totalHouseholds: hh.total_households,
      };
    }
    if (mode === "destination" && spendingItems.length > 0) {
      let families = 0,
        over66 = 0,
        students = 0,
        working = 0,
        total = 0;
      spendingItems.forEach((item) => {
        const hh = allHouseholdData.get(item.location);
        if (!hh) return;
        const share = (item.cardholderSpend ?? 0) / 100;
        families += hh.families_with_children * share;
        over66 += hh.over_66 * share;
        students += hh.students * share;
        working += hh.working_professionals * share;
        total += hh.total_households * share;
      });
      return {
        familiesWithChildren: Math.round(families),
        over66: Math.round(over66),
        students: Math.round(students),
        workingProfessionals: Math.round(working),
        totalHouseholds: Math.round(total),
      };
    }
    return null;
  }, [mode, mapType, allHouseholdData, fetchedDistrict, spendingItems]);

  const activeConsumerMetrics = useMemo<ConsumerMetrics | null>(() => {
    if (!consumerMetrics || !selectedHouseholdFilter || !householdMetrics)
      return consumerMetrics;
    const { totalHouseholds } = householdMetrics;
    if (totalHouseholds === 0) return consumerMetrics;
    let selectedCount = 0;
    if (selectedHouseholdFilter === "families")
      selectedCount = householdMetrics.familiesWithChildren;
    else if (selectedHouseholdFilter === "over66")
      selectedCount = householdMetrics.over66;
    else if (selectedHouseholdFilter === "students")
      selectedCount = householdMetrics.students;
    else if (selectedHouseholdFilter === "working")
      selectedCount = householdMetrics.workingProfessionals;
    const ratio = selectedCount / totalHouseholds;
    return {
      ...consumerMetrics,
      totalConsumers: Math.round(consumerMetrics.totalConsumers * ratio),
      obtainableConsumers: Math.round(
        consumerMetrics.obtainableConsumers * ratio,
      ),
      genderBreakdown: {
        female: Math.round(consumerMetrics.genderBreakdown.female * ratio),
        male: Math.round(consumerMetrics.genderBreakdown.male * ratio),
      },
    };
  }, [consumerMetrics, selectedHouseholdFilter, householdMetrics]);

  // GeoJSON Postcode Listesi
  const postcodes = useMemo(() => {
    if (!geojson?.features) return [];
    return (geojson.features as any[])
      .map((f) => f.properties?.name as string)
      .filter(Boolean)
      .sort();
  }, [geojson]);

  // Recent queries (sorted by createdAt desc)
  const recentQueries = useMemo(() => {
    const all = [
      ...workspaceCards.map((c) => ({
        id: c.id,
        source: c.source as "manual" | "ai",
        district: c.district,
        label: `${c.year} ${c.quarter} · ${c.mode === "origin" ? "Outflow" : "Inflow"}`,
        when: relTime(c.createdAt),
      })),
      ...agentCards.map((c) => ({
        id: c.id,
        source: "ai" as const,
        district: c.district ?? "",
        label: c.title,
        when: "AI",
      })),
    ];
    return all.slice(0, 6);
  }, [workspaceCards, agentCards]);

  const districtLabel = fetchedDistrict
    ? nameMap[fetchedDistrict]
      ? `${fetchedDistrict} · ${nameMap[fetchedDistrict]}`
      : fetchedDistrict
    : undefined;

  const handleDistrictClick = (district: string) =>
    setSelectedDistrict(district);

  // Export all cards as CSV
  function exportAll() {
    const rows = workspaceCards.map((c) => ({
      district: c.district,
      year: c.year,
      quarter: c.quarter,
      mode: c.mode,
      totalSpend: c.totalSpend,
      spendingItemCount: c.spendingItemCount,
    }));
    if (!rows.length) {
      setToastMsg("No cards to export");
      return;
    }
    const csv = [
      "district,year,quarter,mode,totalSpend,districts",
      ...rows.map((r) => Object.values(r).join(",")),
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "spendmap-cards.csv";
    a.click();
    setToastMsg(`Exported ${rows.length} card${rows.length > 1 ? "s" : ""}`);
  }

  // Map node
  const mapNodeCompact = geojsonLoading ? (
    <div
      className="flex h-full items-center justify-center"
      style={{ background: "var(--sm-surface-3)" }}
    >
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#8ce0c2] border-t-transparent" />
    </div>
  ) : !geojson ? (
    <div
      className="flex h-full items-center justify-center"
      style={{ background: "var(--sm-surface-3)" }}
    >
      <span className="text-sm font-medium text-red-400">Map unavailable</span>
    </div>
  ) : (
    <UKMap
      geojson={geojson}
      spendingMap={householdSpendingMap ?? spendingMap}
      selectedDistrict={selectedDistrict}
      fetchedDistrict={fetchedDistrict}
      onDistrictClick={handleDistrictClick}
      mapType={mapType}
      compact={true}
      theme={theme}
    />
  );

  const manualCards = workspaceCards;
  const totalCardCount = manualCards.length + agentCards.length;

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="sm-shell" data-theme={theme}>
      {/* ── RAIL ────────────────────────────────────────────────────────── */}
      <div className="sm-rail">
        <div className="sm-rail-brand" title="SpendMap">
          <svg
            width="34"
            height="34"
            viewBox="0 0 180 180"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect
              width="180"
              height="180"
              rx="40"
              fill="#f6f8fb"
              stroke="#e2e8ef"
              strokeWidth="1"
            />
            <rect
              x="36"
              y="80"
              width="56"
              height="56"
              rx="10"
              fill="#ffffff"
              stroke="#6aa9aa"
              strokeWidth="2.5"
            />
            <line
              x1="36"
              y1="110"
              x2="92"
              y2="110"
              stroke="#cbd5df"
              strokeWidth="1.5"
              strokeDasharray="2 3"
            />
            <rect x="88" y="44" width="56" height="56" rx="10" fill="#6aa9aa" />
            <path
              d="M 62 108 L 120 72"
              stroke="#274a4b"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <path
              d="M 120 72 L 108 72 M 120 72 L 120 84"
              stroke="#274a4b"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="62" cy="108" r="6" fill="#274a4b" />
          </svg>
        </div>
        <button
          className={`sm-rail-btn${activeRailPanel === null ? " active" : ""}`}
          title="Workspace"
          onClick={() => setActiveRailPanel(null)}
        >
          <MapPin size={16} strokeWidth={1.7} />
          {totalCardCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                minWidth: 14,
                height: 14,
                padding: "0 3px",
                borderRadius: 7,
                background: "var(--sm-mint)",
                color: "#0d1f1b",
                fontSize: 9,
                fontWeight: 700,
                display: "grid",
                placeItems: "center",
              }}
            >
              {totalCardCount}
            </span>
          )}
        </button>
        <button
          className={`sm-rail-btn${activeRailPanel === "library" ? " active" : ""}`}
          title="Card library"
          onClick={() => setActiveRailPanel("library")}
        >
          <Layers size={16} strokeWidth={1.7} />
          {savedCards.length > 0 && (
            <span
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                minWidth: 14,
                height: 14,
                padding: "0 3px",
                borderRadius: 7,
                background: "var(--sm-mint)",
                color: "#0d1f1b",
                fontSize: 9,
                fontWeight: 700,
                display: "grid",
                placeItems: "center",
              }}
            >
              {savedCards.length}
            </span>
          )}
        </button>
        <button
          className={`sm-rail-btn${activeRailPanel === "reports" ? " active" : ""}`}
          title="Reports"
          onClick={() => setActiveRailPanel((v) => (v === "reports" ? null : "reports"))}
        >
          <FileText size={16} strokeWidth={1.7} />
          {savedReports.length > 0 && (
            <span style={{ position: "absolute", top: 4, right: 4, minWidth: 14, height: 14, padding: "0 3px", borderRadius: 7, background: "var(--sm-mint)", color: "#0d1f1b", fontSize: 9, fontWeight: 700, display: "grid", placeItems: "center" }}>
              {savedReports.length}
            </span>
          )}
        </button>
        <div className="sm-rail-divider" />
        <button className="sm-rail-btn" title="Settings">
          <Settings size={16} strokeWidth={1.7} />
        </button>
        <div className="sm-rail-spacer" />
        <button
          className="sm-rail-avatar"
          title="Sign out"
          onClick={() => signOut().then(() => window.location.reload())}
        >
          U
        </button>
      </div>

      {/* ── QUERY COLUMN ────────────────────────────────────────────────── */}
      <div className="sm-query-col">
        <div className="sm-col-head">
          <h2>
            {activeRailPanel === "library" ? "Card Library" : activeRailPanel === "reports" ? "Reports" : "Query Builder"}
          </h2>
          <p>
            {activeRailPanel === "library"
              ? "Saved cards and projects."
              : activeRailPanel === "reports"
              ? "Your saved reports."
              : "Pick a district, metric, and window. Results pin as cards."}
          </p>
        </div>

        {activeRailPanel === "library" && (
          <div className="sm-col-body">
            {/* Projects */}
            <div className="sm-field">
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <FolderOpen size={11} />
                  Projects
                </span>
                <button
                  onClick={() => setShowNewProjectInput((v) => !v)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--sm-fg-3)",
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                    fontSize: 11,
                  }}
                >
                  <FolderPlus size={11} /> New
                </button>
              </label>

              {showNewProjectInput && (
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <input
                    autoFocus
                    value={newProjectTitle}
                    onChange={(e) => setNewProjectTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createProject();
                      if (e.key === "Escape") {
                        setShowNewProjectInput(false);
                        setNewProjectTitle("");
                      }
                    }}
                    placeholder="Project name…"
                    style={{
                      flex: 1,
                      fontSize: 12,
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: "1px solid var(--sm-border)",
                      background: "var(--sm-surface-2)",
                      color: "var(--sm-ink)",
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={createProject}
                    disabled={!newProjectTitle.trim()}
                    style={{
                      fontSize: 11,
                      padding: "4px 10px",
                      borderRadius: 6,
                      background: "var(--sm-mint-soft)",
                      color: "var(--sm-mint-ink)",
                      border: "1px solid var(--sm-mint)",
                      cursor: "pointer",
                    }}
                  >
                    Create
                  </button>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <button
                  onClick={() => setSelectedLibraryProject(null)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "5px 8px",
                    borderRadius: 6,
                    border: "1px solid",
                    fontSize: 11,
                    cursor: "pointer",
                    background:
                      selectedLibraryProject === null
                        ? "var(--sm-mint-soft)"
                        : "transparent",
                    borderColor:
                      selectedLibraryProject === null
                        ? "var(--sm-mint)"
                        : "transparent",
                    color:
                      selectedLibraryProject === null
                        ? "var(--sm-mint-ink)"
                        : "var(--sm-fg-2)",
                  }}
                >
                  <span>All cards</span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: "var(--sm-fg-4)",
                    }}
                  >
                    {savedCards.length}
                  </span>
                </button>
                {projects.map((p) => {
                  const count = projectCards.get(p.id)?.size ?? 0;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedLibraryProject(p.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "5px 8px",
                        borderRadius: 6,
                        border: "1px solid",
                        fontSize: 11,
                        cursor: "pointer",
                        background:
                          selectedLibraryProject === p.id
                            ? "var(--sm-mint-soft)"
                            : "transparent",
                        borderColor:
                          selectedLibraryProject === p.id
                            ? "var(--sm-mint)"
                            : "transparent",
                        color:
                          selectedLibraryProject === p.id
                            ? "var(--sm-mint-ink)"
                            : "var(--sm-fg-2)",
                      }}
                    >
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        <FolderOpen size={11} />
                        {p.title}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: "var(--sm-fg-4)",
                        }}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Cards */}
            {savedCards.length === 0 ? (
              <div
                style={{
                  padding: "20px 0",
                  textAlign: "center",
                  fontSize: 12,
                  color: "var(--sm-fg-4)",
                }}
              >
                No saved cards yet. Click the bookmark icon on any AI card.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {savedCards
                  .filter(
                    (sc) =>
                      selectedLibraryProject === null ||
                      projectCards.get(selectedLibraryProject)?.has(sc.id),
                  )
                  .map((sc) => {
                    const spec = JSON.parse(sc.cardSpec) as CardSpec;
                    return (
                      <div
                        key={sc.id}
                        style={{
                          padding: "8px 12px",
                          background: "var(--sm-surface-2)",
                          borderRadius: 8,
                          border: "1px solid var(--sm-border)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            gap: 8,
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: "var(--sm-fg-1)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {spec.title}
                            </div>
                            <div
                              style={{ fontSize: 11, color: "var(--sm-fg-4)" }}
                            >
                              {spec.type} · {spec.district ?? "—"}
                            </div>
                          </div>
                          <div
                            style={{ display: "flex", gap: 4, flexShrink: 0 }}
                          >
                            <button
                              onClick={() => {
                                setAgentCards((prev) => {
                                  if (prev.find((c) => c.id === spec.id))
                                    return prev;
                                  return [...prev, spec];
                                });
                                setCardFilter("ai");
                              }}
                              style={{
                                fontSize: 11,
                                padding: "3px 8px",
                                borderRadius: 5,
                                background: "var(--sm-mint-soft)",
                                color: "var(--sm-mint-ink)",
                                border: "1px solid var(--sm-mint)",
                                cursor: "pointer",
                              }}
                            >
                              Open
                            </button>
                            <button
                              onClick={() => removeFromLibrary(sc.id)}
                              title="Remove from library"
                              style={{
                                fontSize: 11,
                                padding: "3px 6px",
                                borderRadius: 5,
                                background: "transparent",
                                color: "var(--sm-fg-4)",
                                border: "1px solid var(--sm-border)",
                                cursor: "pointer",
                                lineHeight: 1,
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        {projects.length > 0 && (
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 4,
                              alignItems: "center",
                            }}
                          >
                            <span
                              style={{
                                fontSize: 10,
                                color: "var(--sm-fg-4)",
                                marginRight: 2,
                              }}
                            >
                              Projects:
                            </span>
                            {projects.map((p) => {
                              const inProject =
                                projectCards.get(p.id)?.has(sc.id) ?? false;
                              return (
                                <button
                                  key={p.id}
                                  onClick={() =>
                                    toggleCardInProject(sc.id, p.id)
                                  }
                                  style={{
                                    fontSize: 10,
                                    padding: "2px 7px",
                                    borderRadius: 9999,
                                    cursor: "pointer",
                                    border: "1px solid",
                                    background: inProject
                                      ? "var(--sm-mint-soft)"
                                      : "transparent",
                                    borderColor: inProject
                                      ? "var(--sm-mint)"
                                      : "var(--sm-border)",
                                    color: inProject
                                      ? "var(--sm-mint-ink)"
                                      : "var(--sm-fg-3)",
                                  }}
                                >
                                  {inProject ? "✓ " : "+ "}
                                  {p.title}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        <div
          className="sm-col-body"
          style={{ display: activeRailPanel === "library" || activeRailPanel === "reports" ? "none" : undefined }}
        >
          <div className="sm-field">
            <label>
              <BarChart2 size={11} />
              Map type
            </label>
            <MapTypeToggle
              mapType={mapType}
              onMapTypeChange={(t) => {
                setMapType(t);
                if (t === "difference") {
                  setYear(2019);
                  setQuarter("Q1");
                  setEndYear(2019);
                  setEndQuarter("Q2");
                }
              }}
            />
          </div>

          <div className="sm-field">
            <label>
              <ArrowLeftRight size={11} />
              Flow direction
            </label>
            <ModeToggle mode={mode} onModeChange={setMode} />
          </div>

          <div className="sm-field">
            <label>
              <Calendar size={11} />
              {mapType === "difference" ? "Start period" : "Time period"}
            </label>
            <TimeSelector
              year={year}
              quarter={quarter}
              onYearChange={setYear}
              onQuarterChange={setQuarter}
            />
          </div>

          {mapType === "difference" && (
            <div className="sm-field">
              <label>
                <Calendar size={11} />
                End period
              </label>
              <TimeSelector
                year={endYear}
                quarter={endQuarter}
                onYearChange={setEndYear}
                onQuarterChange={setEndQuarter}
              />
            </div>
          )}

          <div className="sm-field">
            <label>
              <MapPin size={11} />
              Focus district
            </label>
            <DistrictSearch
              selectedDistrict={selectedDistrict}
              onDistrictSelect={setSelectedDistrict}
              postcodes={postcodes}
            />
            <p
              style={{
                fontSize: 11,
                color: "var(--sm-fg-4)",
                margin: 0,
                lineHeight: 1.45,
              }}
            >
              Tip: click any postcode area directly on the map.
            </p>
          </div>

          <div
            style={{
              background: "var(--sm-mint-soft)",
              border: "1px solid var(--sm-mint)",
              borderLeft: "3px solid var(--sm-mint)",
              borderRadius: 9,
              padding: "10px 13px",
              fontSize: 11,
              lineHeight: 1.55,
              color: "var(--sm-mint-ink)",
              display: "flex",
              gap: 9,
            }}
          >
            <Sparkles size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Not sure where to look? Ask the <strong>Analyst</strong> on the
              right — it can compose queries and pin answer cards for you.
            </span>
          </div>

          {/* Recent queries */}
          {recentQueries.length > 0 && (
            <div className="sm-field">
              <label>
                <Bookmark size={11} />
                Recent queries
              </label>
              <div className="sm-recent-list">
                {recentQueries.map((r) => (
                  <div
                    key={r.id}
                    className="sm-recent-item"
                    onClick={() => {
                      setSelectedDistrict(r.district);
                      setActiveCardId(r.id);
                    }}
                  >
                    <span className={`sm-recent-tag ${r.source}`}>
                      {r.source === "ai" ? "AI" : "Manual"}
                    </span>
                    <span className="sm-recent-code">{r.district || "—"}</span>
                    <span className="sm-recent-label">{r.label}</span>
                    <span className="sm-recent-when">{r.when}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {activeRailPanel === "reports" && (
          <>
            <div className="sm-col-body">
              {savedReports.length === 0 ? (
                <div style={{ padding: "48px 0", textAlign: "center", color: "var(--sm-fg-4)", fontSize: 12 }}>
                  No saved reports yet.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 14px" }}>
                  {savedReports.map((r) => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button
                        onClick={() => { setOpenReportInitial(r); setShowReportBuilder(true); }}
                        style={{
                          flex: 1, minWidth: 0, textAlign: "left",
                          padding: "9px 12px", borderRadius: 8,
                          background: "var(--sm-surface)", border: "1px solid var(--sm-border)",
                          cursor: "pointer", display: "flex", flexDirection: "column", gap: 2,
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--sm-fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                          {r.title}
                        </span>
                        <span style={{ fontSize: 10, color: "var(--sm-fg-4)" }}>
                          {new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      </button>
                      <button
                        onClick={() => handleDeleteReport(r.id)}
                        style={{ padding: 6, borderRadius: 6, background: "none", border: "1px solid var(--sm-border)", cursor: "pointer", color: "var(--sm-fg-4)", display: "grid", placeItems: "center", flexShrink: 0 }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="sm-col-foot">
              <button
                className="sm-show-btn"
                onClick={() => { setOpenReportInitial(undefined); setShowReportBuilder(true); }}
              >
                <span />
                <span className="sm-show-btn-center">
                  <FileText size={14} />
                  Create New Report
                </span>
                <span />
              </button>
            </div>
          </>
        )}

        <div className="sm-col-foot" style={{ display: activeRailPanel === "library" || activeRailPanel === "reports" ? "none" : undefined }}>
          <button
            className="sm-show-btn"
            onClick={fetchData}
            disabled={!selectedDistrict || isLoading}
          >
            <span />
            <span className="sm-show-btn-center">
              <MapPin size={14} />
              {isLoading ? "Loading…" : "Show on map"}
            </span>
            <span className="sm-show-btn-shortcut"></span>
          </button>
        </div>
      </div>

      {/* ── MAIN COLUMN ─────────────────────────────────────────────────── */}
      <div className="sm-main-col">
        {/* Top bar */}
        <div className="sm-top-bar">
          <div className="crumbs">
            <Briefcase size={13} />
            <span>SpendMap</span>
            <span style={{ color: "var(--sm-fg-4)" }}>/</span>
            <span>UK Districts</span>
            <span style={{ color: "var(--sm-fg-4)" }}>/</span>
            <span className="active">{districtLabel ?? "No focus"}</span>
          </div>
          <span className="sm-status-pill">
            Live · {year} {quarter}
          </span>
          <div className="sm-top-spacer" />
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button className="sm-top-btn" onClick={exportAll}>
              <Download size={11} />
              Export all ({totalCardCount})
            </button>
            <button
              className="sm-top-btn"
              onClick={() =>
                setTheme((t) => (t === "light" ? "dark" : "light"))
              }
            >
              {theme === "light" ? <Moon size={11} /> : <Sun size={11} />}
              {theme === "light" ? "Dark" : "Light"}
            </button>
            <button
              className="sm-top-btn"
              onClick={() => setMapCollapsed((c) => !c)}
            >
              {mapCollapsed ? <Maximize2 size={11} /> : <Minimize2 size={11} />}
              {mapCollapsed ? "Show map" : "Hide map"}
            </button>
          </div>
        </div>

        {/* Workspace: map + cards */}
        <div className="sm-workspace">
          {/* ── MAP ── */}
          <div
            className="sm-map-wrap"
            style={mapCollapsed ? { maxHeight: 0, minHeight: 0 } : undefined}
          >
            {mapNodeCompact}
          </div>

          {/* ── CARDS SECTION ── */}
          <div
            className="sm-cards-wrap"
            style={
              mapCollapsed ? { flex: "1 1 auto", maxHeight: "none" } : undefined
            }
          >
            <div className="sm-cards-header">
              <h3>Data cards</h3>
              <span className="sm-count-badge">{totalCardCount}</span>
              <div className="sm-card-tabs">
                <button
                  className={cardFilter === "both" ? "active" : ""}
                  onClick={() => setCardFilter("both")}
                >
                  <Layers size={11} /> Both{" "}
                  <span
                    style={{
                      fontSize: 10,
                      padding: "1px 5px",
                      borderRadius: 9999,
                      background: "var(--sm-surface-3)",
                      color: "var(--sm-fg-3)",
                    }}
                  >
                    {totalCardCount}
                  </span>
                </button>
                <button
                  className={cardFilter === "manual" ? "active" : ""}
                  onClick={() => setCardFilter("manual")}
                >
                  <BarChart3 size={11} /> Manual{" "}
                  <span
                    style={{
                      fontSize: 10,
                      padding: "1px 5px",
                      borderRadius: 9999,
                      background: "var(--sm-surface-3)",
                      color: "var(--sm-fg-3)",
                    }}
                  >
                    {manualCards.length}
                  </span>
                </button>
                <button
                  className={cardFilter === "ai" ? "active" : ""}
                  onClick={() => setCardFilter("ai")}
                >
                  <Sparkles size={11} /> AI{" "}
                  <span
                    style={{
                      fontSize: 10,
                      padding: "1px 5px",
                      borderRadius: 9999,
                      background:
                        cardFilter === "ai"
                          ? "var(--sm-info-soft)"
                          : "var(--sm-surface-3)",
                      color:
                        cardFilter === "ai"
                          ? "var(--sm-info-ink)"
                          : "var(--sm-fg-3)",
                    }}
                  >
                    {agentCards.length}
                  </span>
                </button>
              </div>
            </div>

            {/* Manual cards section */}
            {(cardFilter === "both" || cardFilter === "manual") && (
              <div className="sm-section">
                {cardFilter === "both" && manualCards.length > 0 && (
                  <div className="sm-section-head">
                    <span className="sm-section-badge manual">
                      <BarChart2 size={10} /> Manual queries
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--sm-fg-4)",
                        marginLeft: 4,
                      }}
                    >
                      {manualCards.length} pinned from query builder
                    </span>
                  </div>
                )}
                {isLoading ? (
                  <div className="sm-cards-loading">
                    {[...Array(6)].map((_, i) => (
                      <div
                        key={i}
                        className="sm-skeleton-card"
                        style={{ animationDelay: `${i * 0.08}s` }}
                      >
                        <div
                          className="sm-skeleton-line"
                          style={{
                            height: 10,
                            width: "55%",
                            animationDelay: `${i * 0.08}s`,
                          }}
                        />
                        <div
                          className="sm-skeleton-line"
                          style={{
                            height: 8,
                            width: "35%",
                            animationDelay: `${i * 0.08 + 0.1}s`,
                          }}
                        />
                        <div
                          className="sm-skeleton-line"
                          style={{
                            height: 80,
                            width: "100%",
                            marginTop: 4,
                            animationDelay: `${i * 0.08 + 0.2}s`,
                          }}
                        />
                      </div>
                    ))}
                  </div>
                ) : manualCards.length === 0 ? (
                  <div className="sm-cards-empty">
                    <h4>No data cards yet</h4>
                    <p>
                      Select a district and click <strong>Show on map</strong>{" "}
                      to pin your first card.
                    </p>
                  </div>
                ) : (
                  <div className="sm-cards-grid">
                    {manualCards.map((card) => {
                      const sharedActions = {
                        active: card.id === activeCardId,
                        onPin: (c: WorkspaceCard) => {
                          setActiveCardId(c.id);
                          setSelectedDistrict(c.district);
                          setToastMsg(`Focused ${c.district} on the map`);
                        },
                        onRemove: (id: string) => {
                          setWorkspaceCards((prev) =>
                            prev.filter((c) => c.id !== id),
                          );
                          if (activeCardId === id) setActiveCardId(null);
                        },
                        onExport: (c: WorkspaceCard) => {
                          const rows = c.allItems.map(
                            (f) => `${f.location},${f.spend}`,
                          );
                          const csv = ["location,spend", ...rows].join("\n");
                          const a = document.createElement("a");
                          a.href = URL.createObjectURL(
                            new Blob([csv], { type: "text/csv" }),
                          );
                          a.download = `${c.district}-${c.year}-${c.quarter}.csv`;
                          a.click();
                          setToastMsg(`Exported ${c.district}.csv`);
                        },
                      };
                      const sub = (type: string) => ({
                        ...sharedActions,
                        onRemove: () => hideSubCard(card.id, type),
                        onSave: () => saveWorkspaceCard(card, type),
                      });
                      return (
                        <React.Fragment key={card.id}>
                          {card.mapType !== "difference" && isSubCardVisible(card.id, "SpendSummary") && (
                            <CardSpendSummary card={card} {...sub("SpendSummary")} />
                          )}
                          {isSubCardVisible(card.id, "MarketOverview") && (
                            <CardMarketOverview card={card} {...sub("MarketOverview")} />
                          )}
                          {isSubCardVisible(card.id, "Gender") && (
                            <CardGender card={card} {...sub("Gender")} />
                          )}
                          {card.mapType === "standard" && isSubCardVisible(card.id, "AgeDistribution") && (
                            <CardAgeDistribution card={card} {...sub("AgeDistribution")} />
                          )}
                          {card.householdMetrics && isSubCardVisible(card.id, "Household") && (
                            <CardHousehold
                              card={card}
                              {...sub("Household")}
                              onHouseholdFilter={(f) => {
                                setSelectedHouseholdFilter(f);
                                if (f) sharedActions.onPin(card);
                              }}
                              activeHouseholdFilter={
                                activeCardId === card.id
                                  ? selectedHouseholdFilter
                                  : null
                              }
                            />
                          )}
                          {isSubCardVisible(card.id, "TopFlows") && (
                            <CardTopFlows card={card} {...sub("TopFlows")} />
                          )}
                          {card.mapType === "standard" && card.top3.length > 0 && isSubCardVisible(card.id, "SpendTrend") && (
                            <CardSpendTrend card={card} {...sub("SpendTrend")} />
                          )}
                          {isSubCardVisible(card.id, "AllFlows") && (
                            <CardAllFlows card={card} {...sub("AllFlows")} />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* AI / agent cards section */}
            {(cardFilter === "both" || cardFilter === "ai") && (
              <div
                className="sm-section"
                style={
                  cardFilter === "both" && manualCards.length > 0
                    ? { marginTop: 24 }
                    : {}
                }
              >
                {cardFilter === "both" && agentCards.length > 0 && (
                  <div className="sm-section-head">
                    <span className="sm-section-badge ai">
                      <MessageSquare size={10} /> AI generated
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--sm-fg-4)",
                        marginLeft: 4,
                      }}
                    >
                      {agentCards.length} answers from Analyst
                    </span>
                  </div>
                )}
                {agentCards.length === 0 ? (
                  <div className="sm-cards-empty">
                    <h4>No AI cards yet</h4>
                    <p>
                      Ask the <strong>Analyst</strong> on the right about
                      spending patterns, trends, or comparisons.
                    </p>
                  </div>
                ) : (
                  <div className="sm-cards-grid">
                    {agentCards.map((card) => (
                      <div
                        key={card.id}
                        className="data-card ai"
                        style={{ maxHeight: 420, overflowY: "auto" }}
                      >
                        <AgentCard
                          card={card}
                          isSaved={savedCardIds.has(card.id)}
                          onSave={() =>
                            saveCard(card, currentSessionId ?? undefined)
                          }
                          onRemove={() =>
                            setAgentCards((prev) =>
                              prev.filter((c) => c.id !== card.id),
                            )
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── AGENT COLUMN ────────────────────────────────────────────────── */}
      <div className="sm-agent-col">
        <div className="sm-agent-head">
          <div className="sm-agent-avatar">
            <Sparkles size={14} strokeWidth={1.8} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="title">Analyst</div>
            <div className="sub">
              {currentSessionId
                ? (sessions.find((s) => s.id === currentSessionId)?.title ??
                  "Active session")
                : "Online · reads your filters"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              className="sm-top-btn"
              title="Chat history"
              onClick={() => setShowSessions((v) => !v)}
              style={{ padding: "3px 6px" }}
            >
              <MessageSquare size={11} />
            </button>
            <button
              className="sm-top-btn"
              title="New chat"
              onClick={startNewChat}
              style={{ padding: "3px 6px" }}
            >
              <Plus size={11} />
            </button>
          </div>
        </div>
        {showSessions && (
          <div
            style={{
              borderBottom: "1px solid var(--sm-border)",
              maxHeight: 180,
              overflowY: "auto",
              background: "var(--sm-surface-2)",
            }}
          >
            {sessions.length === 0 ? (
              <div
                style={{
                  padding: "10px 14px",
                  fontSize: 11,
                  color: "var(--sm-fg-4)",
                }}
              >
                No past conversations
              </div>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    borderBottom: "1px solid var(--sm-border)",
                    background:
                      s.id === currentSessionId
                        ? "var(--sm-surface-3)"
                        : "transparent",
                  }}
                >
                  <button
                    onClick={() => loadSession(s.id)}
                    style={{
                      flex: 1,
                      textAlign: "left",
                      padding: "7px 14px",
                      fontSize: 11,
                      background: "transparent",
                      color:
                        s.id === currentSessionId
                          ? "var(--sm-fg-1)"
                          : "var(--sm-fg-2)",
                      border: "none",
                      cursor: "pointer",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      minWidth: 0,
                    }}
                  >
                    {s.title}
                  </button>
                  <button
                    onClick={(e) => deleteSession(s.id, e)}
                    title="Delete conversation"
                    style={{
                      flexShrink: 0,
                      padding: "4px 8px",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--sm-fg-4)",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        <div className="sm-agent-body">
          {chatMessages.length === 0 && (
            <div className="sm-bubble bot">
              <div className="byline">Analyst · welcome</div>
              Hi! I can query spending flows, demographics, trends, and market
              data. Ask me anything about UK postcode districts.
            </div>
          )}
          {chatMessages
            .filter(
              (msg) =>
                msg.role !== "tool" &&
                !(msg.role === "assistant" && msg.toolCalls?.length),
            )
            .map((msg) => (
              <div
                key={msg.id}
                className={`sm-bubble ${msg.role === "user" ? "user" : "bot"}`}
              >
                {msg.role === "assistant" && (
                  <div className="byline">Analyst · answer</div>
                )}
                {msg.role === "assistant" && msg.toolsUsed && msg.toolsUsed.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <button
                      onClick={() =>
                        setExpandedTools((prev) => {
                          const next = new Set(prev);
                          next.has(msg.id) ? next.delete(msg.id) : next.add(msg.id);
                          return next;
                        })
                      }
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        fontSize: 10, color: "var(--sm-fg-3)", background: "none",
                        border: "none", cursor: "pointer", padding: 0,
                      }}
                    >
                      <ChevronDown
                        size={11}
                        style={{
                          transition: "transform 0.15s",
                          transform: expandedTools.has(msg.id) ? "rotate(180deg)" : "none",
                        }}
                      />
                      {expandedTools.has(msg.id)
                        ? "Tools used"
                        : msg.toolsUsed.map(toolLabel).join(" · ")}
                    </button>
                    {expandedTools.has(msg.id) && (
                      <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2, paddingLeft: 17 }}>
                        {msg.toolsUsed.map((t) => (
                          <span key={t} style={{ fontSize: 10, color: "var(--sm-fg-3)" }}>
                            {toolLabel(t)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {msg.role === "assistant" ? (
                  <MarkdownText content={msg.content} />
                ) : (
                  <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
                )}
                {msg.cards && msg.cards.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShownCards(prev => {
                        const next = new Set(prev);
                        next.has(msg.id) ? next.delete(msg.id) : next.add(msg.id);
                        return next;
                      })}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        fontSize: 10, color: "var(--sm-fg-3)", background: "none",
                        border: "none", cursor: "pointer", padding: "4px 0 2px",
                      }}
                    >
                      <ChevronDown
                        size={11}
                        style={{
                          transition: "transform 0.15s",
                          transform: shownCards.has(msg.id) ? "none" : "rotate(-90deg)",
                        }}
                      />
                      {shownCards.has(msg.id)
                        ? `${msg.cards.length} card${msg.cards.length !== 1 ? "s" : ""}`
                        : `Show ${msg.cards.length} card${msg.cards.length !== 1 ? "s" : ""}`}
                    </button>
                    {shownCards.has(msg.id) && (
                  <div className="sm-bubble-suggests">
                    {msg.cards.map((c) => (
                      <div
                        key={c.id}
                        className="sm-card-preview"
                        onClick={() => {
                          const found = agentCards.find(
                            (ac) => ac.title === c.title,
                          );
                          if (found) setCardFilter("ai");
                        }}
                      >
                        <div className="cp-dot">
                          <BarChart3 size={13} />
                        </div>
                        <div className="cp-txt">
                          <div className="cp-title">{c.title}</div>
                          <div className="cp-sub">
                            {c.district ?? "AI analysis"}
                          </div>
                        </div>
                        <span className="cp-open">Open ↗</span>
                      </div>
                    ))}
                  </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          {streamingContent !== null && (
            <div className="sm-bubble bot">
              <div className="byline">Analyst · answer</div>
              <MarkdownText content={streamingContent} />
              <span className="sm-stream-cursor" />
            </div>
          )}
          {thinkingText && !streamingContent && (
            <div className="sm-bubble bot">
              <div className="byline">Analyst</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div className="sm-typing">
                  <span />
                  <span />
                  <span />
                </div>
                <span style={{ fontSize: 10, color: "var(--sm-fg-3)" }}>
                  {thinkingText}
                </span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <ChatComposer onSend={sendMessage} disabled={isAgentLoading} />
      </div>

      {/* ── TOAST ───────────────────────────────────────────────────────── */}
      {toastMsg && <div className="sm-toast">{toastMsg}</div>}

      {/* ── REPORT BUILDER MODAL ────────────────────────────────────────── */}
      {showReportBuilder && (
        <ReportBuilderModal
          onClose={() => { setShowReportBuilder(false); setOpenReportInitial(undefined); }}
          manualCards={workspaceCards}
          agentCards={agentCards}
          savedCards={savedCards}
          insights={chatMessages.filter((m) => m.role !== "tool" && !!m.content && !m.isLoading)}
          initialReport={openReportInitial}
          onSaveReport={handleSaveReport}
        />
      )}
    </div>
  );
}
