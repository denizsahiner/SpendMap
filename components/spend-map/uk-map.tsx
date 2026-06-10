"use client";

import dynamic from "next/dynamic";
import type { MapType } from "@/lib/types";

const DynamicMapContent = dynamic(() => import("./map-content"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center" style={{ background: "var(--sm-surface-3)" }}>
      <div className="text-center">
        <div className="animate-spin h-8 w-8 border-4 border-[#8ce0c2] border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-sm font-medium" style={{ color: "var(--sm-fg-3)" }}>Generating a map...</p>
      </div>
    </div>
  ),
});

interface UKMapProps {
  geojson: object | null;
  spendingMap: Map<string, number>;
  selectedDistrict: string;
  fetchedDistrict: string;
  onDistrictClick: (district: string) => void;
  mapType: MapType;
  compact?: boolean;
  theme?: "dark" | "light";
}

export function UKMap({
  geojson,
  spendingMap,
  selectedDistrict,
  fetchedDistrict,
  onDistrictClick,
  mapType,
  compact = false,
  theme = "dark",
}: UKMapProps) {
  if (!geojson) return null;

  const isLight = theme === "light";
  const mapBg = isLight ? "#e7ecf2" : "#1f2b41";
  const badgeBg = isLight ? "rgba(255,255,255,.92)" : "rgba(18,26,40,.88)";
  const badgeColor = isLight ? "#274a4b" : "#9ee6c8";
  const badgeBorder = isLight ? "#e2e8ef" : "#25324a";
  const legendBg = isLight ? "rgba(255,255,255,.95)" : "rgba(18,26,40,.92)";
  const legendBorder = isLight ? "#e2e8ef" : "#25324a";
  const legendText = isLight ? "#6b7689" : "#7e8ba1";

  return (
    <div className="relative h-full w-full overflow-hidden border-none outline-none" style={{ background: mapBg }}>
      <DynamicMapContent
        geojson={geojson}
        spendingMap={spendingMap}
        selectedDistrict={selectedDistrict}
        fetchedDistrict={fetchedDistrict}
        onDistrictClick={onDistrictClick}
        mapType={mapType}
        theme={theme}
      />

      {selectedDistrict && (
        <div
          className="absolute left-2 top-2 z-[1000] pointer-events-none rounded px-2 py-0.5 text-[11px] font-semibold shadow-sm"
          style={{ background: badgeBg, color: badgeColor, border: `1px solid ${badgeBorder}` }}
        >
          {selectedDistrict}
        </div>
      )}

      {/* Legend */}
      {compact ? (
        <div className="absolute bottom-2 left-2 z-[1000] pointer-events-none rounded px-2 py-1 shadow-sm" style={{ background: legendBg, border: `1px solid ${legendBorder}` }}>
          <div className="flex items-center gap-1.5">
            {mapType === "standard" ? (
              <div className="flex h-1.5 w-16 overflow-hidden rounded-full">
                <div className="flex-1 bg-[#f1f5f9]" />
                <div className="flex-1 bg-[#bad8eb]" />
                <div className="flex-1 bg-[#7fb2d6]" />
                <div className="flex-1 bg-[#f7b8a1]" />
                <div className="flex-1 bg-[#f28b82]" />
              </div>
            ) : (
              <div className="flex h-1.5 w-16 overflow-hidden rounded-full">
                <div className="flex-1 bg-[#991b1b]" />
                <div className="flex-1 bg-[#ef4444]" />
                <div className="flex-1 bg-[#f1f5f9]" />
                <div className="flex-1 bg-[#10b981]" />
                <div className="flex-1 bg-[#065f46]" />
              </div>
            )}
            <span className="text-[10px]" style={{ color: legendText }}>
              {mapType === "standard" ? "Spend" : "Growth"}
            </span>
          </div>
        </div>
      ) : (
        <div className="absolute bottom-4 left-4 z-[1000] pointer-events-none rounded-xl p-4 shadow-lg" style={{ background: legendBg, border: `1px solid ${legendBorder}` }}>
          <div className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: legendText }}>
            {mapType === "standard" ? "Spend Index" : "Growth / Decline"}
          </div>
          {mapType === "standard" ? (
            <div className="flex items-center gap-2">
              <div className="text-xs font-medium" style={{ color: legendText }}>0</div>
              <div className="flex h-2.5 w-32 overflow-hidden rounded-full shadow-inner" style={{ border: `1px solid ${legendBorder}` }}>
                <div className="flex-1 bg-[#f1f5f9]" />
                <div className="flex-1 bg-[#bad8eb]" />
                <div className="flex-1 bg-[#7fb2d6]" />
                <div className="flex-1 bg-[#f7b8a1]" />
                <div className="flex-1 bg-[#f28b82]" />
              </div>
              <div className="text-xs font-medium" style={{ color: legendText }}>2+</div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="text-xs font-medium" style={{ color: legendText }}>-</div>
              <div className="flex h-2.5 w-32 overflow-hidden rounded-full shadow-inner" style={{ border: `1px solid ${legendBorder}` }}>
                <div className="flex-1 bg-[#991b1b]" />
                <div className="flex-1 bg-[#ef4444]" />
                <div className="flex-1 bg-[#fca5a5]" />
                <div className="flex-1 bg-[#f1f5f9]" />
                <div className="flex-1 bg-[#a7f3d0]" />
                <div className="flex-1 bg-[#10b981]" />
                <div className="flex-1 bg-[#065f46]" />
              </div>
              <div className="text-xs font-medium" style={{ color: legendText }}>+</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
