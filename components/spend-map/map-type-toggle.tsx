"use client";

import type { MapType } from "@/lib/types";
import { BarChart3, TrendingUp } from "lucide-react";

interface MapTypeToggleProps {
  mapType: MapType;
  onMapTypeChange: (type: MapType) => void;
}

export function MapTypeToggle({ mapType, onMapTypeChange }: MapTypeToggleProps) {
  return (
    <div className="sm-seg">
      <button
        className={mapType === "standard" ? "active" : ""}
        onClick={() => onMapTypeChange("standard")}
      >
        <BarChart3 size={12} /> Standard
      </button>
      <button
        className={mapType === "difference" ? "active" : ""}
        onClick={() => onMapTypeChange("difference")}
      >
        <TrendingUp size={12} /> Difference
      </button>
    </div>
  );
}
