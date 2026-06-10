"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { X, Send, FileText, Sparkles, Download, LayoutGrid, MapPin, Check, Pencil, RefreshCw, Save } from "lucide-react";
import { ReportMarkdown } from "./report-markdown";
import type { WorkspaceCard } from "./workspace-data-card";
import type { CardSpec } from "@/lib/agent/types";
import type { ChatMessage } from "@/lib/agent/types";
import { downloadReportPdf } from "@/lib/download";
import postcodeNames from "@/public/postcode-names.json";

const nameMap = postcodeNames as Record<string, string>;

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface OutlineSection {
  id: string;
  heading: string;
  intent: string;
}

type ReportPhase = "chat" | "planning" | "outline_review" | "writing";

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e9) return "£" + (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return "£" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "£" + (n / 1e3).toFixed(0) + "K";
  return n.toFixed(1);
}

// ── Data builder (shared between system prompt and section writers) ───────────

function buildCardsText(
  manualCards: WorkspaceCard[],
  agentCards: CardSpec[],
  insights: ChatMessage[],
): string {
  const manualSection = manualCards.length
    ? manualCards.map((c) => {
        const topFlows = c.top3
          .slice(0, 5)
          .map((f) => {
            const name = nameMap[f.location];
            return name
              ? `${name} (${f.location}): ${f.spend.toFixed(2)}`
              : `${f.location}: ${f.spend.toFixed(2)}`;
          })
          .join(" | ");
        const pop = c.originPopBreakdown;
        const ageBlock = pop
          ? [
              `0-15: ${pop.age_0_15.toLocaleString()}`,
              `16-24: ${pop.age_16_24.toLocaleString()}`,
              `25-34: ${pop.age_25_34.toLocaleString()}`,
              `35-49: ${pop.age_35_49.toLocaleString()}`,
              `50-64: ${pop.age_50_64.toLocaleString()}`,
              `65+: ${pop.over_65.toLocaleString()}`,
            ].join(" | ")
          : null;
        return [
          `### ${c.district} — ${c.districtLabel} (${c.year} ${c.quarter}, ${c.mode})`,
          `- Spend Index: ${c.totalSpend?.toFixed(3) ?? "—"}`,
          `- TAM: ${fmt(c.tam)}  |  TOM: ${fmt(c.tom)}`,
          `- Population: ${c.population?.toLocaleString() ?? "—"}`,
          ageBlock ? `- Age breakdown: ${ageBlock}` : "",
          topFlows ? `- Top flows: ${topFlows}` : "",
        ].filter(Boolean).join("\n");
      }).join("\n\n")
    : "(no manual query data)";

  const agentSection = agentCards.length
    ? agentCards.map((c) => {
        const dataSample = JSON.stringify(c.data ?? []);
        return `### "${c.title}" (${c.type} chart${c.district ? `, ${c.district}` : ""})\nData: ${dataSample}`;
      }).join("\n\n")
    : "(no AI analysis cards)";

  const insightSection = insights.length
    ? insights.map((m) => `---\n[${m.role === "user" ? "User" : "Analyst"}] ${m.content}`).join("\n\n")
    : "(no previous insights)";

  return `--- Manual Query Data ---\n${manualSection}\n\n--- AI Analysis Cards ---\n${agentSection}\n\n--- Previous Analysis Insights ---\n${insightSection}`;
}

// ── System prompt builder ─────────────────────────────────────────────────────

function buildSystemPrompt(
  manualCards: WorkspaceCard[],
  agentCards: CardSpec[],
  insights: ChatMessage[],
): string {
  const dataText = buildCardsText(manualCards, agentCards, insights);

  return `You are a professional analytics report synthesizer for SpendMap UK spending analytics.
Your role is to help users build structured markdown reports from spending, demographic, and market data.

=== AVAILABLE DATA ===

${dataText}

=== END DATA ===

You operate in two modes:

MODE A — CONVERSATION
User asks questions, requests changes, or gives instructions about the report.
Respond with JSON: { "message": "...", "report": null }

MODE B — REPORT GENERATION
User asks to write, create, draft, or generate the report.
Respond with JSON: { "message": "Rapor oluşturuldu.", "report": "<full markdown>" }

REPORT FORMAT RULES (MODE B only):
- First line must be: # Title — 4-8 word concise title
- Executive summary paragraph: 2-3 sentences, no bullets, data-first writing
- ## Header sections for each major topic/district
- **bold** for key metrics and figures
- Numbers must include units and time period: £31K TAM (2023 Q1)
- Close with ## Key Takeaways section (3-5 data-backed bullets)

TABLE RULES — apply strictly:
- ANY comparison of 3+ districts → MUST use a markdown table (| District | Population | TAM | GDHI | ... |)
- ANY ranked list of flows/spend values with 4+ rows → MUST use a table (| District | Spend Index | ... |)
- ANY age breakdown with multiple cohorts → MUST use a table (| Age Group | Count | % of Total |)
- Tables go BEFORE the narrative interpretation
- Every numeric column must have a header with units; use "—" for missing cells

STYLE RULES:
- No emoji anywhere
- Professional institutional analytics tone (UK market)
- £ symbol for all GBP values
- No filler phrases: avoid "it is worth noting", "importantly", "it is clear that"
- Data-first: lead every sentence with the finding, not the method
- Only use data explicitly present in the available data above
- Never mention APIs, databases, GraphQL, or any technical implementation

Always respond with valid JSON. No text outside the JSON object.`;
}

// ── Inline markdown for chat messages ────────────────────────────────────────

function inlineRender(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("*")  && p.endsWith("*"))  return <em key={i}>{p.slice(1, -1)}</em>;
    if (p.startsWith("`")  && p.endsWith("`"))  return <code key={i} style={{ fontFamily: "monospace", fontSize: "0.9em", background: "var(--sm-surface-3)", padding: "1px 4px", borderRadius: 3 }}>{p.slice(1, -1)}</code>;
    return p;
  });
}

function ChatMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^#{1,6}\s/.test(line)) {
      nodes.push(<div key={i} style={{ fontWeight: 700, fontSize: 12, color: "var(--sm-fg-1)", marginTop: i === 0 ? 0 : 8, marginBottom: 2 }}>{inlineRender(line.replace(/^#+\s/, ""))}</div>);
    } else if (/^[-*]\s/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) { items.push(<li key={i}>{inlineRender(lines[i].replace(/^[-*]\s/, ""))}</li>); i++; }
      nodes.push(<ul key={`ul-${i}`} style={{ paddingLeft: 14, margin: "3px 0", display: "flex", flexDirection: "column", gap: 2 }}>{items}</ul>);
      continue;
    } else if (line.trim() === "") {
      nodes.push(<div key={i} style={{ height: 4 }} />);
    } else {
      nodes.push(<div key={i} style={{ lineHeight: 1.55 }}>{inlineRender(line)}</div>);
    }
    i++;
  }
  return <div style={{ fontSize: 12, color: "inherit" }}>{nodes}</div>;
}

// ── Outline section card ──────────────────────────────────────────────────────

function OutlineSectionCard({
  section,
  index,
  onUpdate,
  onRemove,
}: {
  section: OutlineSection;
  index: number;
  onUpdate: (heading: string, intent: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing]   = useState(false);
  const [heading, setHeading]   = useState(section.heading);
  const [intent, setIntent]     = useState(section.intent);

  const save = () => { onUpdate(heading, intent); setEditing(false); };

  return (
    <div style={{ padding: "11px 14px", borderRadius: 8, background: "var(--sm-surface)", border: "1px solid var(--sm-border)" }}>
      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <input
            value={heading}
            onChange={e => setHeading(e.target.value)}
            style={{ fontSize: 13, fontWeight: 600, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--sm-border)", background: "var(--sm-bg)", color: "var(--sm-ink)", outline: "none", fontFamily: "inherit" }}
          />
          <textarea
            value={intent}
            onChange={e => setIntent(e.target.value)}
            rows={2}
            style={{ fontSize: 12, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--sm-border)", background: "var(--sm-bg)", color: "var(--sm-fg-2)", outline: "none", resize: "none", lineHeight: 1.5, fontFamily: "inherit" }}
          />
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button onClick={() => setEditing(false)} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: "none", border: "1px solid var(--sm-border)", color: "var(--sm-fg-3)", cursor: "pointer" }}>
              Cancel
            </button>
            <button onClick={save} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: "var(--sm-mint)", border: "none", color: "#fff", cursor: "pointer" }}>
              Save
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ width: 20, height: 20, borderRadius: 5, background: "var(--sm-surface-2)", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, color: "var(--sm-fg-3)", flexShrink: 0, marginTop: 1 }}>
            {index + 1}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--sm-fg-1)", marginBottom: 3 }}>{section.heading}</div>
            <div style={{ fontSize: 11, color: "var(--sm-fg-4)", lineHeight: 1.45 }}>{section.intent}</div>
          </div>
          <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
            <button onClick={() => { setHeading(section.heading); setIntent(section.intent); setEditing(true); }}
              style={{ padding: "4px", borderRadius: 5, background: "none", border: "none", cursor: "pointer", color: "var(--sm-fg-4)", display: "grid", placeItems: "center" }}>
              <Pencil size={12} />
            </button>
            <button onClick={onRemove}
              style={{ padding: "4px", borderRadius: 5, background: "none", border: "none", cursor: "pointer", color: "var(--sm-fg-4)", display: "grid", placeItems: "center" }}>
              <X size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section-level editable preview ───────────────────────────────────────────

function parseSections(markdown: string): Array<{ heading: string | null; raw: string }> {
  const parts = ("\n" + markdown).split(/\n(?=## )/);
  return parts
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => {
      const m = p.match(/^## (.+)/m);
      return { heading: m ? m[1].trim() : null, raw: p };
    });
}

interface PendingEdit {
  id: string;
  sectionHeading: string | null;
  instruction: string;
}

function EditableSectionPreview({
  markdown,
  pendingEdits,
  onAddToQueue,
  isUpdating,
}: {
  markdown: string;
  pendingEdits: PendingEdit[];
  onAddToQueue: (sectionHeading: string | null, instruction: string) => void;
  isUpdating: boolean;
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx]  = useState<number | null>(null);
  const [prompt, setPrompt]           = useState("");
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const sections = useMemo(() => parseSections(markdown), [markdown]);

  useEffect(() => {
    if (editingIdx !== null) setTimeout(() => promptRef.current?.focus(), 50);
  }, [editingIdx]);

  useEffect(() => { setEditingIdx(null); setPrompt(""); }, [markdown]);

  const addToQueue = (idx: number) => {
    const text = prompt.trim();
    if (!text) return;
    onAddToQueue(sections[idx].heading, text);
    setEditingIdx(null);
    setPrompt("");
  };

  return (
    <div>
      {sections.map((section, idx) => {
        const queued = pendingEdits.filter(e => e.sectionHeading === section.heading);
        return (
          <div
            key={idx}
            style={{ position: "relative", marginBottom: 4 }}
            onMouseEnter={() => setHoveredIdx(idx)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <ReportMarkdown content={section.raw} />

            {/* Queued badge — click to re-open edit with existing instruction */}
            {queued.length > 0 && editingIdx !== idx && (
              <button
                onClick={() => { setEditingIdx(idx); setPrompt(queued[0].instruction); }}
                style={{
                  position: "absolute", top: 4, right: 0,
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "3px 8px", borderRadius: 6,
                  background: "var(--sm-warning-soft, #fef3c7)", border: "1px solid #f59e0b",
                  color: "#b45309", fontSize: 10, fontWeight: 700, cursor: "pointer",
                }}>
                <Pencil size={9} />
                pending
              </button>
            )}

            {/* Edit button — visible on hover */}
            {hoveredIdx === idx && editingIdx !== idx && queued.length === 0 && (
              <button
                onClick={() => { setEditingIdx(idx); setPrompt(""); }}
                style={{
                  position: "absolute", top: 4, right: 0,
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "4px 9px", borderRadius: 6,
                  background: "var(--sm-surface)", border: "1px solid var(--sm-border)",
                  color: "var(--sm-fg-3)", fontSize: 11, fontWeight: 600,
                  cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
                }}
              >
                <Pencil size={10} />
                Edit
              </button>
            )}


            {/* Inline prompt */}
            {editingIdx === idx && (
              <div style={{
                marginTop: 8, padding: "10px 12px", borderRadius: 8,
                background: "var(--sm-surface)", border: "1px solid var(--sm-mint)",
                boxShadow: "0 2px 8px rgba(106,169,170,0.15)",
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--sm-mint-ink)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {section.heading ? `Edit: ${section.heading}` : "Edit intro"}
                </div>
                <textarea
                  ref={promptRef}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addToQueue(idx); } }}
                  placeholder="Describe the change — e.g. only show 3 restaurants"
                  rows={2}
                  style={{
                    width: "100%", resize: "none", fontSize: 12,
                    padding: "6px 9px", borderRadius: 6,
                    border: "1px solid var(--sm-border)",
                    background: "var(--sm-bg)", color: "var(--sm-ink)",
                    outline: "none", lineHeight: 1.5, fontFamily: "inherit",
                    boxSizing: "border-box",
                  }}
                />
                <div style={{ display: "flex", gap: 6, marginTop: 7, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => { setEditingIdx(null); setPrompt(""); }}
                    style={{ padding: "5px 11px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: "none", border: "1px solid var(--sm-border)", color: "var(--sm-fg-3)", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => addToQueue(idx)}
                    disabled={!prompt.trim() || isUpdating}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: prompt.trim() && !isUpdating ? "var(--sm-mint)" : "var(--sm-surface-2)",
                      color: prompt.trim() && !isUpdating ? "#fff" : "var(--sm-fg-4)",
                      border: "none", cursor: prompt.trim() && !isUpdating ? "pointer" : "not-allowed",
                    }}
                  >
                    <Check size={10} />
                    Add to Queue
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export function ReportBuilderModal({
  onClose,
  manualCards,
  agentCards,
  savedCards,
  insights,
  initialReport,
  onSaveReport,
}: {
  onClose: () => void;
  manualCards: WorkspaceCard[];
  agentCards: CardSpec[];
  savedCards: Array<{ id: string; title: string; cardSpec: string }>;
  insights: ChatMessage[];
  initialReport?: { id: string; title: string; markdown: string };
  onSaveReport?: (id: string | null, title: string, markdown: string) => Promise<string | null>;
}) {
  const [reportMarkdown, setReportMarkdown] = useState<string | null>(initialReport?.markdown ?? null);
  const [reportTitle, setReportTitle] = useState(initialReport?.title ?? "SpendMap Report");
  const [reportId, setReportId] = useState<string | null>(initialReport?.id ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([]);
  const [showCardPicker, setShowCardPicker] = useState(false);
  const [reportPhase, setReportPhase] = useState<ReportPhase>("chat");
  const [outlineSections, setOutlineSections] = useState<OutlineSection[]>([]);
  const [sectionContents, setSectionContents] = useState<Record<string, string>>({});
  const [sectionStatus, setSectionStatus] = useState<Record<string, "pending" | "writing" | "done">>({});
  const [selectedManualIds, setSelectedManualIds] = useState<Set<string>>(() => new Set());
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(() => new Set());
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<Set<string>>(() => new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const selectedManual = manualCards.filter((c) => selectedManualIds.has(c.id));
  const selectedAgent  = [
    ...agentCards.filter((c) => selectedAgentIds.has(c.id)),
    ...savedCards
      .filter((sc) => selectedLibraryIds.has(sc.id))
      .map((sc) => JSON.parse(sc.cardSpec) as CardSpec),
  ];
  const totalSelected  = selectedManualIds.size + selectedAgentIds.size + selectedLibraryIds.size;

  // Initial greeting
  useEffect(() => {
    if (initialReport) {
      setMessages([{
        id: "init",
        role: "assistant",
        content: `You're editing **${initialReport.title}**.\n\nYou can ask me to make changes, add sections, or regenerate the report. Use the card picker to include additional data.`,
      }]);
      return;
    }
    const parts: string[] = [];
    if (manualCards.length) parts.push(`${manualCards.length} data card${manualCards.length !== 1 ? "s" : ""}`);
    if (agentCards.length)  parts.push(`${agentCards.length} AI card${agentCards.length !== 1 ? "s" : ""}`);
    if (insights.length)    parts.push(`${insights.length} insight${insights.length !== 1 ? "s" : ""}`);
    const summary = parts.length ? parts.join(", ") : "no content yet";

    setMessages([{
      id: "init",
      role: "assistant",
      content: `Hello! You currently have **${summary}** available.\n\nTell me what kind of report you want — I'll put together a structured analysis. For example:\n- "Generate a market analysis report using all data"\n- "Write a catchment area report focused on CV2"\n- "Add spending trends to the Key Takeaways"`,
    }]);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Assemble report markdown from streamed section contents during writing phase
  useEffect(() => {
    if (reportPhase !== "writing") return;
    const parts = outlineSections.map(s => sectionContents[s.id]).filter(Boolean);
    if (!parts.length) return;
    const assembled = `# ${reportTitle}\n\n` + parts.join("\n\n");
    setReportMarkdown(assembled);
  }, [sectionContents, outlineSections, reportPhase, reportTitle]);

  // ── Plan report handler ───────────────────────────────────────────────────────

  const handlePlanReport = useCallback(async (userIntent?: string) => {
    setShowCardPicker(false);
    setReportPhase("planning");

    const cardsSummary = [
      ...selectedManual.map(c =>
        `Manual: ${c.districtLabel} (${c.district}), ${c.year} ${c.quarter}, ${c.mode} — TAM: ${fmt(c.tam)}, TOM: ${fmt(c.tom)}, Pop: ${c.population?.toLocaleString() ?? "—"}`
      ),
      ...selectedAgent.map(c =>
        `AI Card: "${c.title}" (${c.type}${c.district ? `, ${c.district}` : ""})`
      ),
    ].join("\n") || "No data available";

    try {
      const res = await fetch("/api/report-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardsSummary, userIntent }),
      });
      const data = await res.json() as { title?: string; sections?: { heading: string; intent: string }[]; error?: string };

      if (!res.ok || data.error) {
        setReportPhase("chat");
        setMessages(prev => [...prev, { id: uid(), role: "assistant", content: "Couldn't generate outline. Please try again." }]);
        return;
      }

      setReportTitle(data.title ?? "SpendMap Report");
      setOutlineSections((data.sections ?? []).map(s => ({ ...s, id: uid() })));
      setReportPhase("outline_review");
    } catch {
      setReportPhase("chat");
      setMessages(prev => [...prev, { id: uid(), role: "assistant", content: "Something went wrong. Please try again." }]);
    }
  }, [selectedManual, selectedAgent]);

  // ── Write sections handler ────────────────────────────────────────────────────

  const handleWriteReport = useCallback(async () => {
    if (!outlineSections.length) return;
    setReportPhase("writing");
    setReportMarkdown(null);
    setSectionContents({});
    setSectionStatus(Object.fromEntries(outlineSections.map(s => [s.id, "pending" as const])));

    const dataText = buildCardsText(selectedManual, selectedAgent, insights);
    const allHeadings = outlineSections.map(s => s.heading);

    const writeOne = async (section: OutlineSection, idx: number): Promise<string> => {
      setSectionStatus(prev => ({ ...prev, [section.id]: "writing" }));
      let content = "";
      try {
        const res = await fetch("/api/report-section", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            heading:     section.heading,
            intent:      section.intent,
            dataText,
            allHeadings,
            isLast:      idx === outlineSections.length - 1,
          }),
        });

        const reader  = res.body!.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          content += decoder.decode(value, { stream: true });
          setSectionContents(prev => ({ ...prev, [section.id]: content }));
        }
        setSectionStatus(prev => ({ ...prev, [section.id]: "done" }));
      } catch {
        setSectionStatus(prev => ({ ...prev, [section.id]: "done" }));
      }
      return content;
    };

    const results = await Promise.all(outlineSections.map((s, i) => writeOne(s, i)));

    // Explicitly assemble final report — avoids React batching race with phase change
    const finalParts = outlineSections.map((_s, i) => results[i]).filter(Boolean);
    const finalMarkdown = `# ${reportTitle}\n\n` + finalParts.join("\n\n");
    setReportMarkdown(finalMarkdown);
    setReportPhase("chat");
    setMessages(prev => [...prev, {
      id: uid(),
      role: "assistant",
      content: `Report written — ${outlineSections.length} sections. You can ask me to refine any section or add more detail.`,
    }]);
  }, [outlineSections, selectedManual, selectedAgent, insights]);

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isLoading) return;

    const userMsg: ChatMsg = { id: uid(), role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    if (!overrideText) setInput("");
    setIsLoading(true);

    try {
      const systemPrompt = buildSystemPrompt(selectedManual, selectedAgent, insights);
      const history = messages
        .filter(m => m.id !== "init")
        .map(m => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/report-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt, history, message: text }),
      });

      const json = await res.json() as { content?: string; error?: string };
      if (!res.ok || json.error) {
        setMessages(prev => [...prev, { id: uid(), role: "assistant", content: `Error: ${json.error ?? "Unknown server error"}` }]);
        return;
      }

      const content = json.content ?? "";
      let parsed: { message: string; report?: string | null };
      try {
        const match = content.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(match?.[0] ?? content);
      } catch {
        parsed = { message: content, report: null };
      }

      if (parsed.report) {
        setReportMarkdown(parsed.report);
        // Extract H1 as title
        const h1 = parsed.report.match(/^#\s+(.+)/m)?.[1]?.trim();
        if (h1) setReportTitle(h1);
      }

      setMessages(prev => [...prev, { id: uid(), role: "assistant", content: parsed.message }]);
    } catch {
      setMessages(prev => [...prev, { id: uid(), role: "assistant", content: "Something went wrong. Please try again." }]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, isLoading, messages, selectedManual, selectedAgent, insights]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleGenerate = useCallback(() => {
    handlePlanReport();
  }, [handlePlanReport]);

  const handleAddToReport = useCallback(async () => {
    if (!reportMarkdown || isLoading) return;
    setShowCardPicker(false);

    const userMsg: ChatMsg = { id: uid(), role: "user", content: "Add selected cards to the existing report." };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const systemPrompt = buildSystemPrompt(selectedManual, selectedAgent, insights);
      const history = messages
        .filter(m => m.id !== "init")
        .map(m => ({ role: m.role, content: m.content }));

      const fullPrompt = `The current report is below. Extend it by incorporating any newly selected data that is not yet covered. Keep all existing sections and content intact — only add new sections or update existing ones where the new data is directly relevant. Return the complete updated report.\n\n${reportMarkdown}`;

      const res = await fetch("/api/report-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt, history, message: fullPrompt }),
      });

      const addJson = await res.json() as { content?: string; error?: string };
      if (!res.ok || addJson.error) {
        setMessages(prev => [...prev, { id: uid(), role: "assistant", content: `Error: ${addJson.error ?? "Unknown error"}` }]);
        return;
      }
      const content = addJson.content ?? "";
      let parsed: { message: string; report?: string | null };
      try {
        const match = content.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(match?.[0] ?? content);
      } catch {
        parsed = { message: content, report: null };
      }

      if (parsed.report) {
        setReportMarkdown(parsed.report);
        const h1 = parsed.report.match(/^#\s+(.+)/m)?.[1]?.trim();
        if (h1) setReportTitle(h1);
      }
      setMessages(prev => [...prev, { id: uid(), role: "assistant", content: parsed.message }]);
    } catch {
      setMessages(prev => [...prev, { id: uid(), role: "assistant", content: "Something went wrong. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  }, [reportMarkdown, isLoading, messages, selectedManual, selectedAgent, insights]);

  const handleAddToQueue = useCallback((sectionHeading: string | null, instruction: string) => {
    setPendingEdits(prev => {
      const existing = prev.find(e => e.sectionHeading === sectionHeading);
      if (existing) {
        return prev.map(e => e.sectionHeading === sectionHeading ? { ...e, instruction } : e);
      }
      return [...prev, { id: uid(), sectionHeading, instruction }];
    });
  }, []);

  const handleApplyAll = useCallback(async () => {
    if (!reportMarkdown || !pendingEdits.length || isLoading) return;

    const instructionsList = pendingEdits
      .map((e, i) => {
        const target = e.sectionHeading ? `"## ${e.sectionHeading}"` : "the introduction/summary";
        return `${i + 1}. In ${target}: ${e.instruction}`;
      })
      .join("\n");

    const userMsg: ChatMsg = {
      id: uid(),
      role: "user",
      content: `Apply ${pendingEdits.length} change${pendingEdits.length !== 1 ? "s" : ""}:\n${instructionsList}`,
    };
    setMessages(prev => [...prev, userMsg]);
    setPendingEdits([]);
    setIsLoading(true);

    try {
      const systemPrompt = buildSystemPrompt(selectedManual, selectedAgent, insights);
      const history = messages
        .filter(m => m.id !== "init")
        .map(m => ({ role: m.role, content: m.content }));

      const updateMsg = `The current full report is:\n\n${reportMarkdown}\n\n---\nApply ALL of the following changes:\n${instructionsList}\n\nReturn the complete updated report with every change applied.`;

      const res = await fetch("/api/report-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt, history, message: updateMsg }),
      });
      const json = await res.json() as { content?: string; error?: string };
      if (!res.ok || json.error) {
        setMessages(prev => [...prev, { id: uid(), role: "assistant", content: `Error: ${json.error ?? "Unknown error"}` }]);
        return;
      }
      const content = json.content ?? "";
      let parsed: { message: string; report?: string | null };
      try {
        const match = content.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(match?.[0] ?? content);
      } catch {
        parsed = { message: content, report: null };
      }
      if (parsed.report) {
        setReportMarkdown(parsed.report);
        const h1 = parsed.report.match(/^#\s+(.+)/m)?.[1]?.trim();
        if (h1) setReportTitle(h1);
      }
      setMessages(prev => [...prev, { id: uid(), role: "assistant", content: parsed.message }]);
    } catch {
      setMessages(prev => [...prev, { id: uid(), role: "assistant", content: "Something went wrong. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  }, [reportMarkdown, pendingEdits, isLoading, messages, selectedManual, selectedAgent, insights]);

  const handleSave = useCallback(async () => {
    if (!reportMarkdown || !onSaveReport || isSaving) return;
    setIsSaving(true);
    const savedId = await onSaveReport(reportId, reportTitle, reportMarkdown);
    if (savedId) {
      setReportId(savedId);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2000);
    }
    setIsSaving(false);
  }, [reportMarkdown, reportTitle, reportId, onSaveReport, isSaving]);

  const handleSaveAsNew = useCallback(async () => {
    if (!reportMarkdown || !onSaveReport || isSaving) return;
    setIsSaving(true);
    const savedId = await onSaveReport(null, reportTitle, reportMarkdown);
    if (savedId) {
      setReportId(savedId);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2000);
    }
    setIsSaving(false);
  }, [reportMarkdown, reportTitle, onSaveReport, isSaving]);

  const handleExport = () => {
    if (!reportMarkdown) return;
    const slug = reportTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    downloadReportPdf(slug, reportTitle, reportMarkdown);
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "min(1200px, 100%)", height: "min(840px, 92vh)",
        background: "var(--sm-surface)", borderRadius: 16,
        border: "1px solid var(--sm-border)",
        boxShadow: "0 24px 64px rgba(0,0,0,0.28)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 18px", borderBottom: "1px solid var(--sm-border)", flexShrink: 0 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--sm-mint-soft)", color: "var(--sm-mint-ink)", display: "grid", placeItems: "center" }}>
            <FileText size={14} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--sm-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {reportTitle}
            </div>
            <div style={{ fontSize: 10, color: "var(--sm-fg-4)" }}>Report Builder</div>
          </div>
          <button
            onClick={() => setShowCardPicker(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 13px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: showCardPicker ? "var(--sm-mint-soft)" : "var(--sm-surface-2)",
              color: showCardPicker ? "var(--sm-mint-ink)" : "var(--sm-fg-2)",
              border: `1px solid ${showCardPicker ? "var(--sm-mint)" : "var(--sm-border)"}`,
              cursor: "pointer",
            }}
          >
            <LayoutGrid size={13} />
            Select Cards
            {totalSelected > 0 && (
              <span style={{
                background: "var(--sm-mint)", color: "#fff",
                borderRadius: 10, fontSize: 10, fontWeight: 700,
                padding: "1px 6px", lineHeight: 1.5,
              }}>
                {totalSelected}
              </span>
            )}
          </button>
          {onSaveReport && reportId && (
            <button
              onClick={handleSaveAsNew}
              disabled={!reportMarkdown || isSaving}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 13px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: "none",
                color: reportMarkdown && !isSaving ? "var(--sm-fg-3)" : "var(--sm-fg-4)",
                border: `1px solid var(--sm-border)`,
                cursor: reportMarkdown && !isSaving ? "pointer" : "not-allowed",
              }}
            >
              <Save size={12} />
              Save as New
            </button>
          )}
          {onSaveReport && (
            <button
              onClick={handleSave}
              disabled={!reportMarkdown || isSaving}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 13px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: savedToast ? "var(--sm-success-soft, #d1fae5)" : reportMarkdown && !isSaving ? "var(--sm-surface-2)" : "var(--sm-surface-2)",
                color: savedToast ? "#065f46" : reportMarkdown && !isSaving ? "var(--sm-fg-2)" : "var(--sm-fg-4)",
                border: `1px solid ${savedToast ? "#6ee7b7" : "var(--sm-border)"}`,
                cursor: reportMarkdown && !isSaving ? "pointer" : "not-allowed",
                transition: "all 0.2s",
              }}
            >
              <Save size={12} />
              {isSaving ? "Saving…" : savedToast ? "Saved" : reportId ? "Update" : "Save"}
            </button>
          )}
          <button
            onClick={handleExport}
            disabled={!reportMarkdown}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 13px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: reportMarkdown ? "var(--sm-mint)" : "var(--sm-surface-2)",
              color: reportMarkdown ? "#fff" : "var(--sm-fg-4)",
              border: "none", cursor: reportMarkdown ? "pointer" : "not-allowed",
            }}
          >
            <Download size={13} />
            Download PDF
          </button>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--sm-fg-3)", padding: 6, borderRadius: 8, display: "grid", placeItems: "center" }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* ── Chat pane ── */}
          <div style={{ width: 340, flexShrink: 0, borderRight: "1px solid var(--sm-border)", display: "flex", flexDirection: "column", background: "var(--sm-surface-2)" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
              {messages.map((msg) => (
                <div key={msg.id} style={{ display: "flex", gap: 8, flexDirection: msg.role === "user" ? "row-reverse" : "row" }}>
                  {msg.role === "assistant" && (
                    <div style={{ width: 24, height: 24, borderRadius: 7, background: "var(--sm-info-soft)", color: "var(--sm-info-ink)", display: "grid", placeItems: "center", flexShrink: 0, marginTop: 2 }}>
                      <Sparkles size={11} />
                    </div>
                  )}
                  <div style={{
                    maxWidth: "88%", padding: "9px 11px",
                    borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "2px 12px 12px 12px",
                    background: msg.role === "user" ? "var(--sm-mint)" : "var(--sm-surface)",
                    color: msg.role === "user" ? "#fff" : "var(--sm-fg-1)",
                    border: msg.role === "user" ? "none" : "1px solid var(--sm-border)",
                    fontSize: 12, lineHeight: 1.5,
                  }}>
                    {msg.role === "assistant"
                      ? <ChatMarkdown content={msg.content} />
                      : msg.content
                    }
                  </div>
                </div>
              ))}

              {isLoading && (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ width: 24, height: 24, borderRadius: 7, background: "var(--sm-info-soft)", color: "var(--sm-info-ink)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <Sparkles size={11} />
                  </div>
                  <div style={{ display: "flex", gap: 4, padding: "9px 12px", background: "var(--sm-surface)", border: "1px solid var(--sm-border)", borderRadius: "2px 12px 12px 12px" }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--sm-fg-4)", animation: "rb-pulse 1.2s ease-in-out infinite", animationDelay: `${i * 0.2}s` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div style={{ padding: "9px 10px", borderTop: "1px solid var(--sm-border)", display: "flex", gap: 7, alignItems: "flex-end" }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about the report or request changes…"
                disabled={isLoading}
                rows={2}
                style={{
                  flex: 1, resize: "none", fontSize: 12,
                  padding: "7px 10px", borderRadius: 8,
                  border: "1px solid var(--sm-border)",
                  background: "var(--sm-surface)", color: "var(--sm-ink)",
                  outline: "none", lineHeight: 1.5, fontFamily: "inherit",
                }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || isLoading}
                style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: input.trim() && !isLoading ? "var(--sm-mint)" : "var(--sm-surface-2)",
                  border: "none", cursor: input.trim() && !isLoading ? "pointer" : "not-allowed",
                  color: input.trim() && !isLoading ? "#fff" : "var(--sm-fg-4)",
                  display: "grid", placeItems: "center",
                }}
              >
                <Send size={13} />
              </button>
            </div>
          </div>

          {/* ── Right pane: card picker or preview ── */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--sm-bg)" }}>

            {showCardPicker ? (
              /* Card picker — fixed header + scrollable list + fixed footer */
              <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {/* Header */}
                <div style={{ flexShrink: 0, padding: "16px 24px 12px", borderBottom: "1px solid var(--sm-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--sm-fg-1)" }}>Select cards to include</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => {
                        setSelectedManualIds(new Set(manualCards.map(c => c.id)));
                        setSelectedAgentIds(new Set(agentCards.map(c => c.id)));
                        setSelectedLibraryIds(new Set(savedCards.map(sc => sc.id)));
                      }}
                      style={{ fontSize: 11, color: "var(--sm-mint)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                    >
                      Select all
                    </button>
                    <span style={{ color: "var(--sm-fg-4)", fontSize: 11 }}>·</span>
                    <button
                      onClick={() => { setSelectedManualIds(new Set()); setSelectedAgentIds(new Set()); setSelectedLibraryIds(new Set()); }}
                      style={{ fontSize: 11, color: "var(--sm-fg-3)", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                    >
                      Clear
                    </button>
                  </div>
                </div>
                {/* Scrollable card list */}
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 24px" }}>

                {manualCards.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--sm-fg-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
                      Data Cards
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {manualCards.map((c) => {
                        const on = selectedManualIds.has(c.id);
                        return (
                          <button
                            key={c.id}
                            onClick={() => setSelectedManualIds(prev => {
                              const next = new Set(prev);
                              on ? next.delete(c.id) : next.add(c.id);
                              return next;
                            })}
                            style={{
                              display: "flex", alignItems: "center", gap: 10,
                              padding: "9px 12px", borderRadius: 8, textAlign: "left",
                              background: on ? "var(--sm-mint-soft)" : "var(--sm-surface)",
                              border: `1px solid ${on ? "var(--sm-mint)" : "var(--sm-border)"}`,
                              cursor: "pointer", transition: "all 0.1s",
                            }}
                          >
                            <div style={{
                              width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                              background: on ? "var(--sm-mint)" : "var(--sm-surface-2)",
                              border: `1px solid ${on ? "var(--sm-mint)" : "var(--sm-border)"}`,
                              display: "grid", placeItems: "center",
                              color: "#fff",
                            }}>
                              {on && <Check size={10} />}
                            </div>
                            <MapPin size={12} style={{ color: "var(--sm-fg-3)", flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--sm-fg-1)" }}>{c.districtLabel} <span style={{ fontWeight: 400, color: "var(--sm-fg-4)" }}>{c.district}</span></div>
                              <div style={{ fontSize: 10, color: "var(--sm-fg-4)" }}>{c.year} {c.quarter} · {c.mode}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {agentCards.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--sm-fg-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
                      AI Analysis Cards
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {agentCards.map((c) => {
                        const on = selectedAgentIds.has(c.id);
                        return (
                          <button
                            key={c.id}
                            onClick={() => setSelectedAgentIds(prev => {
                              const next = new Set(prev);
                              on ? next.delete(c.id) : next.add(c.id);
                              return next;
                            })}
                            style={{
                              display: "flex", alignItems: "center", gap: 10,
                              padding: "9px 12px", borderRadius: 8, textAlign: "left",
                              background: on ? "var(--sm-mint-soft)" : "var(--sm-surface)",
                              border: `1px solid ${on ? "var(--sm-mint)" : "var(--sm-border)"}`,
                              cursor: "pointer", transition: "all 0.1s",
                            }}
                          >
                            <div style={{
                              width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                              background: on ? "var(--sm-mint)" : "var(--sm-surface-2)",
                              border: `1px solid ${on ? "var(--sm-mint)" : "var(--sm-border)"}`,
                              display: "grid", placeItems: "center",
                              color: "#fff",
                            }}>
                              {on && <Check size={10} />}
                            </div>
                            <Sparkles size={12} style={{ color: "var(--sm-fg-3)", flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--sm-fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
                              <div style={{ fontSize: 10, color: "var(--sm-fg-4)" }}>{c.type}{c.district ? ` · ${c.district}` : ""}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {savedCards.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--sm-fg-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
                      Card Library
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {savedCards.map((sc) => {
                        const spec = JSON.parse(sc.cardSpec) as CardSpec;
                        const on = selectedLibraryIds.has(sc.id);
                        return (
                          <button
                            key={sc.id}
                            onClick={() => setSelectedLibraryIds(prev => {
                              const next = new Set(prev);
                              on ? next.delete(sc.id) : next.add(sc.id);
                              return next;
                            })}
                            style={{
                              display: "flex", alignItems: "center", gap: 10,
                              padding: "9px 12px", borderRadius: 8, textAlign: "left",
                              background: on ? "var(--sm-mint-soft)" : "var(--sm-surface)",
                              border: `1px solid ${on ? "var(--sm-mint)" : "var(--sm-border)"}`,
                              cursor: "pointer", transition: "all 0.1s",
                            }}
                          >
                            <div style={{
                              width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                              background: on ? "var(--sm-mint)" : "var(--sm-surface-2)",
                              border: `1px solid ${on ? "var(--sm-mint)" : "var(--sm-border)"}`,
                              display: "grid", placeItems: "center", color: "#fff",
                            }}>
                              {on && <Check size={10} />}
                            </div>
                            <Sparkles size={12} style={{ color: "var(--sm-fg-3)", flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--sm-fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{spec.title}</div>
                              <div style={{ fontSize: 10, color: "var(--sm-fg-4)" }}>{spec.type}{spec.district ? ` · ${spec.district}` : ""} · Library</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {!manualCards.length && !agentCards.length && !savedCards.length && (
                  <div style={{ textAlign: "center", color: "var(--sm-fg-4)", fontSize: 13, padding: "40px 0" }}>
                    No cards available yet.
                  </div>
                )}
                </div>{/* end scrollable list */}

                {/* Fixed footer */}
                <div style={{ flexShrink: 0, padding: "12px 24px", borderTop: "1px solid var(--sm-border)", display: "flex", flexDirection: "column", gap: 8, background: "var(--sm-bg)" }}>
                  {reportMarkdown ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={handleAddToReport}
                        disabled={totalSelected === 0 || isLoading}
                        style={{
                          flex: 1, padding: "9px", borderRadius: 8,
                          background: totalSelected > 0 && !isLoading ? "var(--sm-mint)" : "var(--sm-surface-2)",
                          color: totalSelected > 0 && !isLoading ? "#fff" : "var(--sm-fg-4)",
                          border: "none", cursor: totalSelected > 0 && !isLoading ? "pointer" : "not-allowed",
                          fontSize: 12, fontWeight: 700,
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        }}
                      >
                        <Sparkles size={12} />
                        Add to Report
                      </button>
                      <button
                        onClick={handleGenerate}
                        disabled={totalSelected === 0 || isLoading}
                        style={{
                          flex: 1, padding: "9px", borderRadius: 8,
                          background: "none",
                          color: totalSelected > 0 && !isLoading ? "var(--sm-fg-2)" : "var(--sm-fg-4)",
                          border: `1px solid ${totalSelected > 0 && !isLoading ? "var(--sm-border)" : "var(--sm-surface-3)"}`,
                          cursor: totalSelected > 0 && !isLoading ? "pointer" : "not-allowed",
                          fontSize: 12, fontWeight: 600,
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        }}
                      >
                        <RefreshCw size={12} />
                        Regenerate
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleGenerate}
                      disabled={totalSelected === 0 || isLoading}
                      style={{
                        width: "100%", padding: "9px", borderRadius: 8,
                        background: totalSelected > 0 && !isLoading ? "var(--sm-mint)" : "var(--sm-surface-2)",
                        color: totalSelected > 0 && !isLoading ? "#fff" : "var(--sm-fg-4)",
                        border: "none", cursor: totalSelected > 0 && !isLoading ? "pointer" : "not-allowed",
                        fontSize: 13, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                      }}
                    >
                      <Sparkles size={13} />
                      Generate Report
                      {totalSelected > 0 && <span style={{ opacity: 0.8, fontWeight: 400, fontSize: 12 }}>({totalSelected} card{totalSelected !== 1 ? "s" : ""})</span>}
                    </button>
                  )}
                  <button
                    onClick={() => setShowCardPicker(false)}
                    style={{
                      width: "100%", padding: "7px", borderRadius: 8,
                      background: "none", color: "var(--sm-fg-3)",
                      border: "1px solid var(--sm-border)", cursor: "pointer", fontSize: 12, fontWeight: 600,
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : reportPhase === "planning" ? (
              /* Planning spinner */
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: "var(--sm-fg-3)", textAlign: "center" }}>
                <div style={{ display: "flex", gap: 5 }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--sm-mint)", animation: "rb-pulse 1.2s ease-in-out infinite", animationDelay: `${i * 0.2}s` }} />
                  ))}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Planning report outline…</div>
                <div style={{ fontSize: 12, color: "var(--sm-fg-4)" }}>Analysing your data cards</div>
              </div>

            ) : reportPhase === "outline_review" ? (
              /* Outline review */
              <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {/* Header */}
                <div style={{ flexShrink: 0, padding: "16px 24px 12px", borderBottom: "1px solid var(--sm-border)" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--sm-fg-1)" }}>Report Outline</div>
                  <div style={{ fontSize: 11, color: "var(--sm-fg-4)", marginTop: 2 }}>Review and edit sections before writing</div>
                </div>
                {/* Section list */}
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {outlineSections.map((s, idx) => (
                    <OutlineSectionCard
                      key={s.id}
                      section={s}
                      index={idx}
                      onUpdate={(heading, intent) =>
                        setOutlineSections(prev => prev.map(x => x.id === s.id ? { ...x, heading, intent } : x))
                      }
                      onRemove={() =>
                        setOutlineSections(prev => prev.filter(x => x.id !== s.id))
                      }
                    />
                  ))}
                  <button
                    onClick={() => setOutlineSections(prev => [...prev, { id: uid(), heading: "New Section", intent: "Describe what this section should cover." }])}
                    style={{ padding: "8px", borderRadius: 8, border: "1px dashed var(--sm-border)", background: "none", color: "var(--sm-fg-4)", fontSize: 12, cursor: "pointer", fontWeight: 600 }}
                  >
                    + Add Section
                  </button>
                </div>
                {/* Footer */}
                <div style={{ flexShrink: 0, padding: "12px 20px", borderTop: "1px solid var(--sm-border)", display: "flex", flexDirection: "column", gap: 8, background: "var(--sm-bg)" }}>
                  <button
                    onClick={handleWriteReport}
                    disabled={!outlineSections.length}
                    style={{
                      width: "100%", padding: "10px", borderRadius: 8,
                      background: outlineSections.length ? "var(--sm-mint)" : "var(--sm-surface-2)",
                      color: outlineSections.length ? "#fff" : "var(--sm-fg-4)",
                      border: "none", cursor: outlineSections.length ? "pointer" : "not-allowed",
                      fontSize: 13, fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                    }}
                  >
                    <Sparkles size={13} />
                    Write Report
                    <span style={{ opacity: 0.8, fontWeight: 400, fontSize: 12 }}>({outlineSections.length} section{outlineSections.length !== 1 ? "s" : ""})</span>
                  </button>
                  <button
                    onClick={() => setReportPhase("chat")}
                    style={{ width: "100%", padding: "7px", borderRadius: 8, background: "none", color: "var(--sm-fg-3)", border: "1px solid var(--sm-border)", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                  >
                    Cancel
                  </button>
                </div>
              </div>

            ) : (
              /* Report preview (used during writing + chat phases) */
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "28px 36px" }}>
                {reportPhase === "writing" && (
                  /* Section progress bar */
                  <div style={{ marginBottom: 24, padding: "12px 16px", borderRadius: 10, background: "var(--sm-surface)", border: "1px solid var(--sm-border)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--sm-fg-3)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Writing sections…
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {outlineSections.map(s => {
                        const status = sectionStatus[s.id] ?? "pending";
                        return (
                          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center",
                              background: status === "done" ? "var(--sm-mint)" : status === "writing" ? "var(--sm-mint-soft)" : "var(--sm-surface-2)",
                              border: `1px solid ${status === "done" ? "var(--sm-mint)" : status === "writing" ? "var(--sm-mint)" : "var(--sm-border)"}`,
                            }}>
                              {status === "done" && <Check size={9} color="#fff" />}
                              {status === "writing" && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--sm-mint)", animation: "rb-pulse 1.2s ease-in-out infinite" }} />}
                            </div>
                            <span style={{ fontSize: 12, color: status === "pending" ? "var(--sm-fg-4)" : "var(--sm-fg-2)", fontWeight: status === "writing" ? 600 : 400 }}>
                              {s.heading}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {!reportMarkdown ? (
                  <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: "var(--sm-fg-4)", textAlign: "center", paddingTop: 120 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 14, background: "var(--sm-surface-2)", display: "grid", placeItems: "center" }}>
                      <FileText size={22} strokeWidth={1.5} />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--sm-fg-3)", marginBottom: 6 }}>No report generated yet</div>
                      <div style={{ fontSize: 12 }}>
                        Select cards above, then click Generate Report.
                      </div>
                    </div>
                  </div>
                ) : (
                  <EditableSectionPreview
                    markdown={reportMarkdown}
                    pendingEdits={pendingEdits}
                    onAddToQueue={handleAddToQueue}
                    isUpdating={isLoading}
                  />
                )}
              </div>
            )}

            {/* ── Pending edits bar ── */}
            {pendingEdits.length > 0 && !showCardPicker && (
              <div style={{
                flexShrink: 0, borderTop: "1px solid #f59e0b",
                background: "var(--sm-warning-soft, #fffbeb)",
                padding: "10px 16px",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#b45309", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 7 }}>
                      {pendingEdits.length} queued change{pendingEdits.length !== 1 ? "s" : ""}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {pendingEdits.map((e) => (
                        <div
                          key={e.id}
                          style={{
                            display: "flex", alignItems: "center", gap: 5,
                            padding: "3px 8px 3px 10px", borderRadius: 20,
                            background: "#fff", border: "1px solid #f59e0b",
                            fontSize: 11, color: "#92400e", maxWidth: 260,
                          }}
                        >
                          <span style={{ fontWeight: 600, color: "#b45309", flexShrink: 0 }}>
                            {e.sectionHeading ?? "Intro"}:
                          </span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {e.instruction}
                          </span>
                          <button
                            onClick={() => setPendingEdits(prev => prev.filter(x => x.id !== e.id))}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#b45309", padding: "0 0 0 2px", display: "grid", placeItems: "center", flexShrink: 0 }}
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={handleApplyAll}
                    disabled={isLoading}
                    style={{
                      flexShrink: 0, display: "flex", alignItems: "center", gap: 6,
                      padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                      background: isLoading ? "var(--sm-surface-2)" : "#f59e0b",
                      color: isLoading ? "var(--sm-fg-4)" : "#fff",
                      border: "none", cursor: isLoading ? "not-allowed" : "pointer",
                      boxShadow: isLoading ? "none" : "0 2px 6px rgba(245,158,11,0.35)",
                    }}
                  >
                    <RefreshCw size={12} />
                    Apply All
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes rb-pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
