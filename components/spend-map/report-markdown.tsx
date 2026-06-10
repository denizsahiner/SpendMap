"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const components: Components = {
  h1: ({ children }) => (
    <h1 style={{
      fontSize: 22, fontWeight: 800, color: "var(--sm-ink)",
      margin: "0 0 16px", lineHeight: 1.25, letterSpacing: "-0.02em",
      paddingBottom: 12, borderBottom: "2px solid var(--sm-mint)",
    }}>
      {children}
    </h1>
  ),

  h2: ({ children }) => (
    <h2 style={{
      fontSize: 14, fontWeight: 700, color: "var(--sm-fg-1)",
      margin: "28px 0 10px", paddingBottom: 6,
      borderBottom: "1px solid var(--sm-border)",
      textTransform: "uppercase", letterSpacing: "0.05em",
    }}>
      {children}
    </h2>
  ),

  h3: ({ children }) => (
    <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--sm-fg-1)", margin: "16px 0 6px" }}>
      {children}
    </h3>
  ),

  p: ({ children }) => (
    <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--sm-fg-2)", margin: "0 0 10px" }}>
      {children}
    </p>
  ),

  strong: ({ children }) => (
    <strong style={{ fontWeight: 700, color: "var(--sm-fg-1)" }}>{children}</strong>
  ),

  ul: ({ children }) => (
    <ul style={{ paddingLeft: 18, margin: "6px 0 12px", display: "flex", flexDirection: "column", gap: 4 }}>
      {children}
    </ul>
  ),

  ol: ({ children }) => (
    <ol style={{ paddingLeft: 20, margin: "6px 0 12px", display: "flex", flexDirection: "column", gap: 4 }}>
      {children}
    </ol>
  ),

  li: ({ children }) => (
    <li style={{ fontSize: 13, lineHeight: 1.6, color: "var(--sm-fg-2)" }}>{children}</li>
  ),

  blockquote: ({ children }) => (
    <blockquote style={{
      margin: "12px 0",
      paddingLeft: 14,
      borderLeft: "3px solid var(--sm-mint)",
      color: "var(--sm-fg-3)",
      fontStyle: "italic",
    }}>
      {children}
    </blockquote>
  ),

  code: ({ children, className }) => {
    const isBlock = className?.startsWith("language-");
    if (isBlock) {
      return (
        <pre style={{
          background: "var(--sm-navy)", color: "#e2e8f0",
          borderRadius: 8, padding: "12px 16px", overflowX: "auto",
          fontSize: 12, lineHeight: 1.6, margin: "10px 0",
        }}>
          <code>{children}</code>
        </pre>
      );
    }
    return (
      <code style={{
        fontFamily: "monospace", fontSize: "0.88em",
        background: "var(--sm-surface-3)", color: "var(--sm-fg-1)",
        padding: "2px 5px", borderRadius: 4,
      }}>
        {children}
      </code>
    );
  },

  table: ({ children }) => (
    <div style={{
      overflowX: "auto", borderRadius: 10,
      border: "1px solid var(--sm-border)",
      boxShadow: "var(--sm-shadow-sm)",
      margin: "12px 0 20px",
    }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        {children}
      </table>
    </div>
  ),

  thead: ({ children }) => (
    <thead style={{ background: "var(--sm-navy)", color: "#fff" }}>
      {children}
    </thead>
  ),

  th: ({ children }) => (
    <th style={{
      padding: "9px 14px", textAlign: "left",
      fontWeight: 600, fontSize: 11,
      letterSpacing: "0.04em", textTransform: "uppercase",
      color: "#fff", whiteSpace: "nowrap",
    }}>
      {children}
    </th>
  ),

  tbody: ({ children }) => <tbody>{children}</tbody>,

  tr: ({ children }) => (
    <tr style={{ borderBottom: "1px solid var(--sm-border)", transition: "background 0.1s" }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(106,169,170,0.08)")}
      onMouseLeave={e => (e.currentTarget.style.background = "")}
    >
      {children}
    </tr>
  ),

  td: ({ children }) => (
    <td style={{ padding: "8px 14px", color: "var(--sm-fg-2)", verticalAlign: "top" }}>
      {children}
    </td>
  ),

  hr: () => (
    <hr style={{ border: "none", borderTop: "1px solid var(--sm-border)", margin: "20px 0" }} />
  ),
};

export function ReportMarkdown({ content }: { content: string }) {
  return (
    <div style={{ fontFamily: "inherit" }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
