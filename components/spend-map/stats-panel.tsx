"use client";

import { MapPin } from "lucide-react";
import type { SpendingLocationItem } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface StatsPanelProps {
  isLoading: boolean;
  totalSpend: number | null;
  top3: SpendingLocationItem[];
  tam: number | null;
  tom: number | null;
}

export function StatsPanel({
  isLoading,
  totalSpend,
  top3,
  tam,
  tom,
}: StatsPanelProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse space-y-3">
          <div className="h-16 rounded-lg bg-[#111724] border border-[#2a3441]" />
          <div className="h-24 rounded-lg bg-[#111724] border border-[#2a3441]" />
        </div>
      </div>
    );
  }

  if (totalSpend === null) return null;

  return (
    <div className="space-y-4 mb-6">
      {tam !== null && (
        <div className="rounded-lg border border-[#2a3441] bg-[#111724] px-4 py-3 shadow-inner">
          <div className="text-xs font-bold text-[#8fa0b5] uppercase tracking-wider mb-1">
            Total Available Market
          </div>
          <div className="text-lg font-semibold text-[#8ce0c2]">
            {formatCurrency(tam)}
          </div>
        </div>
      )}
      {tom !== null && (
        <div className="rounded-lg border border-[#2a3441] bg-[#111724] px-4 py-3 shadow-inner">
          <div className="text-xs font-bold text-[#8fa0b5] uppercase tracking-wider mb-1">
            Total Obtainable Market
          </div>
          <div className="text-lg font-semibold text-[#8ce0c2]">
            {formatCurrency(tom)}
          </div>
        </div>
      )}
      {top3.length > 0 && (
        <div className="rounded-lg border border-[#2a3441] bg-[#111724] overflow-hidden shadow-inner">
          <div className="flex items-center gap-2 px-4 py-3 bg-[#151c2c] border-b border-[#2a3441]">
            <MapPin className="h-4 w-4 text-[#8fa0b5]" />
            <span className="text-xs font-bold text-[#8fa0b5] uppercase tracking-wider">
              Top 3 Districts
            </span>
          </div>

          <div className="divide-y divide-[#2a3441]">
            {top3.map((item, index) => (
              <div
                key={`${item.location}-${index}`}
                className="flex items-center justify-between px-4 py-3 transition-colors duration-200 hover:bg-[#1a2332]"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-[#8fa0b5] w-4">
                    {index + 1}.
                  </span>
                  <div className="font-medium text-white tracking-wide text-sm">
                    {item.location}
                  </div>
                </div>
                <div className="font-semibold text-[#8ce0c2] text-sm">
                  {Number(item.spend).toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
