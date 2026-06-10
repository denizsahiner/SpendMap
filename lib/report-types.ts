import type { WorkspaceCard } from "@/components/spend-map/workspace-data-card";
import type { CardSpec } from "@/lib/agent/types";

export interface ReportPayload {
  title: string;
  generatedAt: string;
  markdown?: string;
  manualCards: WorkspaceCard[];
  agentCards: CardSpec[];
  insights: { id: string; content: string }[];
}
