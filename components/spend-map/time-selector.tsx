"use client";

import { YEARS, QUARTERS } from "@/lib/mock-data";

interface TimeSelectorProps {
  year: number;
  quarter: string;
  onYearChange: (year: number) => void;
  onQuarterChange: (quarter: string) => void;
}

export function TimeSelector({ year, quarter, onYearChange, onQuarterChange }: TimeSelectorProps) {
  return (
    <div className="sm-time-row">
      <select
        className="sm-select"
        value={year}
        onChange={(e) => onYearChange(parseInt(e.target.value))}
      >
        {YEARS.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <select
        className="sm-select"
        value={quarter}
        onChange={(e) => onQuarterChange(e.target.value)}
      >
        {QUARTERS.map((q) => (
          <option key={q} value={q}>{q}</option>
        ))}
      </select>
    </div>
  );
}
