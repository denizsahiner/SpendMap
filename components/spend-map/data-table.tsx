"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import type { SpendingLocationItem } from "@/lib/types";
import postcodeNames from "@/public/postcode-names.json";

const nameMap = postcodeNames as Record<string, string>;

interface DataTableProps {
  items: SpendingLocationItem[];
  isLoading: boolean;
}

export function DataTable({ items, isLoading }: DataTableProps) {
  // Arama metnini tutacağımız state
  const [searchTerm, setSearchTerm] = useState("");

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-[#2a3441] bg-[#111724] shadow-inner">
        <p className="text-sm font-medium text-[#8fa0b5] animate-pulse">
          Loading data...
        </p>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-[#2a3441] bg-[#111724] shadow-inner">
        <p className="text-sm text-[#8fa0b5]">No flows to display</p>
      </div>
    );
  }

  // SİHİRLİ KISIM: Arama metnine göre listeyi anlık olarak filtreliyoruz
  const filteredItems = items.filter((item) => {
    const lower = searchTerm.toLowerCase();
    return (
      item.location.toLowerCase().includes(lower) ||
      (nameMap[item.location] ?? "").toLowerCase().includes(lower)
    );
  });

  return (
    <div className="space-y-3">
      {/* ŞIK ARAMA KUTUSU */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8fa0b5]" />
        <input
          type="text"
          placeholder="Search district in flows..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-md border border-[#2a3441] bg-[#111724] py-2 pl-9 pr-4 text-sm text-white placeholder:text-[#8fa0b5] shadow-inner focus:border-[#8ce0c2] focus:outline-none focus:ring-1 focus:ring-[#8ce0c2] transition-all"
        />
      </div>

      {/* TABLO */}
      <div className="relative max-h-[300px] overflow-auto rounded-lg border border-[#2a3441] bg-[#111724] sidebar-scroll shadow-inner">
        <table className="w-full text-left text-sm text-[#c4d0e0]">
          <thead className="sticky top-0 z-10 bg-[#151c2c] text-xs uppercase tracking-wider text-[#8fa0b5] shadow-sm shadow-[#111724]">
            <tr>
              <th className="px-4 py-3 font-semibold border-b border-[#2a3441]">
                District
              </th>
              <th className="px-4 py-3 font-semibold border-b border-[#2a3441] text-right">
                Spend Index
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#2a3441]">
            {filteredItems.length > 0 ? (
              filteredItems.map((item, index) => (
                <tr
                  key={`${item.location}-${index}`}
                  className="transition-colors duration-200 hover:bg-[#1a2332]"
                >
                  <td className="px-4 py-3">
                    <span className="font-medium text-white">{item.location}</span>
                    {nameMap[item.location] && (
                      <span className="block text-xs text-[#8fa0b5] mt-0.5">
                        {nameMap[item.location]}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-[#8ce0c2]">
                    {Number(item.spend).toFixed(3)}
                  </td>
                </tr>
              ))
            ) : (
              /* Arama sonucu bulunamazsa çıkacak mesaj */
              <tr>
                <td
                  colSpan={2}
                  className="px-4 py-8 text-center text-[#8fa0b5] text-sm italic"
                >
                  No districts found matching "{searchTerm}"
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
