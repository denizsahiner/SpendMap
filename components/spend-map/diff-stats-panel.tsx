"use client";

import { TrendingUp, TrendingDown } from "lucide-react";
import type { DiffLocationItem } from "@/lib/types";

interface DiffStatsPanelProps {
  isLoading: boolean;
  topPositive: DiffLocationItem[];
  topNegative: DiffLocationItem[];
}

export function DiffStatsPanel({
  isLoading,
  topPositive,
  topNegative,
}: DiffStatsPanelProps) {
  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-32 rounded-lg bg-[#111724] border border-[#2a3441]" />
        <div className="h-32 rounded-lg bg-[#111724] border border-[#2a3441]" />
      </div>
    );
  }

  if (!topPositive.length && !topNegative.length) return null;

  return (
    <div className="space-y-4 mb-6">
      {/* TOP GAINERS (Artış Gösterenler) */}
      {topPositive.length > 0 && (
        <div className="rounded-lg border border-[#065f46] bg-[#111724] overflow-hidden shadow-inner">
          <div className="flex items-center gap-2 px-4 py-3 bg-[#064e3b]/30 border-b border-[#065f46]">
            <TrendingUp className="h-4 w-4 text-[#34d399]" />
            <span className="text-xs font-bold text-[#34d399] uppercase tracking-wider">
              Top Gainers
            </span>
          </div>
          <div className="divide-y divide-[#2a3441]">
            {topPositive.map((item, i) => (
              <div
                key={item.location}
                className="flex justify-between px-4 py-2 hover:bg-[#1a2332] transition-colors"
              >
                <div className="text-sm font-medium text-white">
                  {i + 1}. {item.location}
                </div>
                <div className="text-sm font-bold text-[#34d399]">
                  +{item.spend_diff.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TOP LOSERS (Düşüş Gösterenler) */}
      {topNegative.length > 0 && (
        <div className="rounded-lg border border-[#991b1b] bg-[#111724] overflow-hidden shadow-inner">
          <div className="flex items-center gap-2 px-4 py-3 bg-[#7f1d1d]/30 border-b border-[#991b1b]">
            <TrendingDown className="h-4 w-4 text-[#fb7185]" />
            <span className="text-xs font-bold text-[#fb7185] uppercase tracking-wider">
              Top Losers
            </span>
          </div>
          <div className="divide-y divide-[#2a3441]">
            {topNegative.map((item, i) => (
              <div
                key={item.location}
                className="flex justify-between px-4 py-2 hover:bg-[#1a2332] transition-colors"
              >
                <div className="text-sm font-medium text-white">
                  {i + 1}. {item.location}
                </div>
                <div className="text-sm font-bold text-[#fb7185]">
                  {item.spend_diff.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
