"use client";

import React, { useEffect, useState } from "react";
import { Printer, MapPin, Sparkles } from "lucide-react";
import { AgentCard } from "@/components/spend-map/data-cards";
import { ReportMarkdown } from "@/components/spend-map/report-markdown";
import type { WorkspaceCard } from "@/components/spend-map/workspace-data-card";
import type { ReportPayload } from "@/lib/report-types";
import postcodeNames from "@/public/postcode-names.json";

const nameMap = postcodeNames as Record<string, string>;

// ── Markdown renderer ─────────────────────────────────────────────────────────

function inlineRender(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**"))
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("*") && p.endsWith("*"))
      return <em key={i}>{p.slice(1, -1)}</em>;
    if (p.startsWith("`") && p.endsWith("`"))
      return <code key={i} style={{ fontFamily: "monospace", fontSize: "0.9em", background: "var(--sm-surface-3)", padding: "1px 4px", borderRadius: 3 }}>{p.slice(1, -1)}</code>;
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
      nodes.push(
        <div key={i} style={{ fontWeight: 700, fontSize: level <= 2 ? 14 : 12, color: "var(--sm-fg-1)", marginTop: i === 0 ? 0 : 12, marginBottom: 4 }}>
          {inlineRender(text)}
        </div>,
      );
    } else if (/^[-*]\s/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(<li key={i}>{inlineRender(lines[i].replace(/^[-*]\s/, ""))}</li>);
        i++;
      }
      nodes.push(<ul key={`ul-${i}`} style={{ paddingLeft: 16, margin: "4px 0", display: "flex", flexDirection: "column", gap: 2 }}>{items}</ul>);
      continue;
    } else if (/^\d+\.\s/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(<li key={i}>{inlineRender(lines[i].replace(/^\d+\.\s/, ""))}</li>);
        i++;
      }
      nodes.push(<ol key={`ol-${i}`} style={{ paddingLeft: 18, margin: "4px 0", display: "flex", flexDirection: "column", gap: 2 }}>{items}</ol>);
      continue;
    } else if (line.trim() === "") {
      nodes.push(<div key={i} style={{ height: 6 }} />);
    } else {
      nodes.push(<div key={i} style={{ lineHeight: 1.6 }}>{inlineRender(line)}</div>);
    }
    i++;
  }
  return <div style={{ fontSize: 13, color: "var(--sm-fg-2)" }}>{nodes}</div>;
}

// ── Manual card summary ───────────────────────────────────────────────────────

function fmt(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(1);
}

function ReportManualCard({ card }: { card: WorkspaceCard }) {
  const stats = [
    { label: "Total Spend", value: fmt(card.totalSpend) },
    { label: "Population",  value: fmt(card.population) },
    { label: "TAM",         value: card.tam ? "£" + fmt(card.tam) : "—" },
    { label: "TOM",         value: card.tom ? "£" + fmt(card.tom) : "—" },
  ];

  return (
    <div className="data-card manual">
      <div className="card-top">
        <div className="kind"><MapPin size={13} /></div>
        <div className="card-title-wrap">
          <h4 className="card-title">
            {card.districtLabel}
            <span className="code">{card.district}</span>
          </h4>
          <p className="card-sub">
            {card.year} {card.quarter}
            <span className="dot" />
            {card.mode}
            <span className="dot" />
            {card.mapType}
          </p>
        </div>
      </div>

      <div style={{ padding: "0 16px 10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px" }}>
        {stats.map(({ label, value }) => (
          <div key={label}>
            <div style={{ fontSize: 10, color: "var(--sm-fg-4)", marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--sm-fg-1)", fontFamily: "monospace" }}>{value}</div>
          </div>
        ))}
      </div>

      {card.top3.length > 0 && (
        <div style={{ padding: "0 16px 14px" }}>
          <div style={{ fontSize: 10, color: "var(--sm-fg-4)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
            Top Flows
          </div>
          {card.top3.map((flow, idx) => (
            <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, padding: "4px 0", borderBottom: "1px solid var(--sm-border)" }}>
              <span style={{ color: "var(--sm-fg-2)" }}>{nameMap[flow.location] || flow.location}</span>
              <span style={{ fontWeight: 600, color: "var(--sm-fg-1)", fontFamily: "monospace", fontSize: 12 }}>{flow.spend.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: 11, fontWeight: 700, color: "var(--sm-fg-4)",
      textTransform: "uppercase", letterSpacing: "0.08em",
      margin: "0 0 16px", paddingBottom: 8,
      borderBottom: "1px solid var(--sm-border)",
    }}>
      {children}
    </h2>
  );
}

// ── Report page ───────────────────────────────────────────────────────────────

export default function ReportPage() {
  const [payload, setPayload] = useState<ReportPayload | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("spendmap_report");
    if (raw) {
      try {
        setPayload(JSON.parse(raw) as ReportPayload);
      } catch { /* ignore */ }
    }
  }, []);

  if (!payload) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh", color: "var(--sm-fg-4)", fontSize: 14 }}>
        No report data. Open the Report Builder in SpendMap first.
      </div>
    );
  }

  const date = new Date(payload.generatedAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .data-card { break-inside: avoid; }
        }
        .data-card { background: var(--sm-surface); border: 1px solid var(--sm-border); border-radius: var(--card-radius, 10px); overflow: hidden; }
        .report-cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
      `}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px", fontFamily: "inherit", color: "var(--sm-ink)" }}>

        {/* Print button */}
        <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 28 }}>
          <button
            onClick={() => window.print()}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 18px", borderRadius: 8,
              background: "var(--sm-mint)", color: "#fff",
              border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
              boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
            }}
          >
            <Printer size={14} />
            Print / Save as PDF
          </button>
        </div>

        {/* Report header */}
        <div style={{ borderBottom: "2px solid var(--sm-mint)", paddingBottom: 20, marginBottom: 36 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--sm-fg-4)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
            SpendMap Analytics
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--sm-ink)", margin: "0 0 6px", lineHeight: 1.2 }}>
            {payload.title}
          </h1>
          <p style={{ fontSize: 12, color: "var(--sm-fg-4)", margin: 0 }}>Generated {date}</p>
        </div>

        {/* Synthesized markdown report */}
        {payload.markdown ? (
          <section style={{ marginBottom: 44 }}>
            <ReportMarkdown content={payload.markdown} />
          </section>
        ) : (
          <>
            {/* Fallback: legacy insight blocks */}
            {payload.insights.length > 0 && (
              <section style={{ marginBottom: 44 }}>
                <SectionHeader>
                  <Sparkles size={11} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
                  Insights
                </SectionHeader>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {payload.insights.map((insight) => (
                    <div key={insight.id} style={{ background: "var(--sm-surface)", border: "1px solid var(--sm-border)", borderLeft: "3px solid var(--sm-mint)", borderRadius: 10, padding: "16px 20px" }}>
                      <MarkdownText content={insight.content} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Fallback: manual cards */}
            {payload.manualCards.length > 0 && (
              <section style={{ marginBottom: 44 }}>
                <SectionHeader>
                  <MapPin size={11} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
                  Data Cards
                </SectionHeader>
                <div className="report-cards-grid">
                  {payload.manualCards.map((card) => <ReportManualCard key={card.id} card={card} />)}
                </div>
              </section>
            )}

            {/* Fallback: AI cards */}
            {payload.agentCards.length > 0 && (
              <section style={{ marginBottom: 44 }}>
                <SectionHeader>
                  <Sparkles size={11} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
                  AI Analysis Cards
                </SectionHeader>
                <div className="report-cards-grid">
                  {payload.agentCards.map((card) => (
                    <div key={card.id} className="data-card ai"><AgentCard card={card} /></div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* Footer */}
        <div style={{
          borderTop: "1px solid var(--sm-border)",
          paddingTop: 14, marginTop: 8,
          display: "flex", justifyContent: "space-between",
          fontSize: 11, color: "var(--sm-fg-4)",
        }}>
          <span>SpendMap Analytics</span>
          <span>{date}</span>
        </div>
      </div>
    </>
  );
}
