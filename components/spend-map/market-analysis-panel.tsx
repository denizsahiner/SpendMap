"use client";

import { useState } from "react";
import { TrendingUp, Search } from "lucide-react";
import type { SpendingLocationItem } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

interface MarketAnalysisPanelProps {
  isLoading: boolean;
  items: SpendingLocationItem[];
  totalTom: number;
}

export function MarketAnalysisPanel({ isLoading, items, totalTom }: MarketAnalysisPanelProps) {
  const [searchTerm, setSearchTerm] = useState("");

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="animate-pulse space-y-2">
          <div className="h-20 rounded-lg bg-[#111724] border border-[#2a3441]" />
          <div className="h-40 rounded-lg bg-[#111724] border border-[#2a3441]" />
        </div>
      </div>
    );
  }

  if (items.length === 0) return null;

  const totalTam = items.reduce((sum, item) => sum + (item.tam ?? 0), 0);
  const penetrationRate = totalTam > 0 ? (totalTom / totalTam) * 100 : 0;

  const sorted = [...items]
    .filter((i) => i.tam !== undefined && i.tom !== undefined)
    .sort((a, b) => (b.tom ?? 0) - (a.tom ?? 0));

  const filtered = sorted.filter((item) =>
    item.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-3 mb-6">
      {/* Headline Metrics */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-[#2a3441] bg-[#111724] px-3 py-2 shadow-inner">
          <div className="text-xs font-bold text-[#8fa0b5] uppercase tracking-wider mb-1">
            Total TAM
          </div>
          <div className="text-sm font-semibold text-[#c4d0e0]">
            {formatCurrency(totalTam)}
          </div>
        </div>
        <div className="rounded-lg border border-[#2a3441] bg-[#111724] px-3 py-2 shadow-inner">
          <div className="text-xs font-bold text-[#8fa0b5] uppercase tracking-wider mb-1">
            Total TOM
          </div>
          <div className="text-sm font-semibold text-[#8ce0c2]">
            {formatCurrency(totalTom)}
          </div>
        </div>
        <div className="rounded-lg border border-[#2a3441] bg-[#111724] px-3 py-2 shadow-inner">
          <div className="text-xs font-bold text-[#8fa0b5] uppercase tracking-wider mb-1 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Rate
          </div>
          <div className="text-sm font-semibold text-[#8ce0c2]">
            {penetrationRate.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Breakdown Table */}
      <div className="rounded-lg border border-[#2a3441] bg-[#111724] overflow-hidden shadow-inner">
        <div className="px-4 py-2 bg-[#151c2c] border-b border-[#2a3441]">
          <span className="text-xs font-bold text-[#8fa0b5] uppercase tracking-wider">
            Market Breakdown
          </span>
        </div>
        <div className="px-3 py-2 border-b border-[#2a3441]">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#8fa0b5]" />
            <input
              type="text"
              placeholder="Search district..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded border border-[#2a3441] bg-[#0d1522] py-1 pl-7 pr-3 text-xs text-white placeholder:text-[#8fa0b5] focus:border-[#8ce0c2] focus:outline-none transition-all"
            />
          </div>
        </div>
        <div className="max-h-[240px] overflow-auto sidebar-scroll">
          <table className="w-full text-left text-xs text-[#c4d0e0]">
            <thead className="sticky top-0 bg-[#151c2c] text-[10px] uppercase tracking-wider text-[#8fa0b5]">
              <tr>
                <th className="px-3 py-2 font-semibold border-b border-[#2a3441]">District</th>
                <th className="px-3 py-2 font-semibold border-b border-[#2a3441] text-right">TAM</th>
                <th className="px-3 py-2 font-semibold border-b border-[#2a3441] text-right">Spend %</th>
                <th className="px-3 py-2 font-semibold border-b border-[#2a3441] text-right">TOM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a3441]">
              {filtered.length > 0 ? (
                filtered.map((item, index) => (
                  <tr key={`${item.location}-${index}`} className="hover:bg-[#1a2332] transition-colors">
                    <td className="px-3 py-2 font-medium text-white">{item.location}</td>
                    <td className="px-3 py-2 text-right text-[#c4d0e0]">{formatCurrency(item.tam ?? 0)}</td>
                    <td className="px-3 py-2 text-right text-[#8fa0b5]">{Number(item.spend).toFixed(2)}%</td>
                    <td className="px-3 py-2 text-right font-semibold text-[#8ce0c2]">{formatCurrency(item.tom ?? 0)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-[#8fa0b5] italic">
                    No districts found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
