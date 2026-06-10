"use client";

import type { Mode } from "@/lib/types";

interface ModeToggleProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
}

export function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
  return (
    <div className="sm-seg">
      <button
        className={mode === "origin" ? "active" : ""}
        onClick={() => onModeChange("origin")}
      >
        Origin
      </button>
      <button
        className={mode === "destination" ? "active" : ""}
        onClick={() => onModeChange("destination")}
      >
        Destination
      </button>
    </div>
  );
}
