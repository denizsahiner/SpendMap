"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Search } from "lucide-react";
import postcodeNames from "@/public/postcode-names.json";

const nameMap = postcodeNames as Record<string, string>;

interface DistrictSearchProps {
  selectedDistrict: string;
  onDistrictSelect: (district: string) => void;
  postcodes: string[];
}

export function DistrictSearch({ selectedDistrict, onDistrictSelect, postcodes }: DistrictSearchProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() => {
    if (!query) return postcodes;
    const s = query.toLowerCase();
    return postcodes.filter(
      (code) => code.toLowerCase().includes(s) || (nameMap[code] ?? "").toLowerCase().includes(s)
    );
  }, [query, postcodes]);

  const displayValue = open
    ? query
    : selectedDistrict
    ? `${selectedDistrict}${nameMap[selectedDistrict] ? ` · ${nameMap[selectedDistrict]}` : ""}`
    : query;

  return (
    <div className="sm-input-wrap" ref={ref}>
      <Search className="lead" />
      <input
        className="sm-input"
        placeholder={postcodes.length ? "Search postcode or area…" : "Loading…"}
        value={displayValue}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); setQuery(""); }}
      />
      {open && (
        <div className="sm-dropdown">
          {filtered.length === 0 ? (
            <div className="sm-dropdown-empty">No districts match "{query}"</div>
          ) : (
            filtered.slice(0, 14).map((code) => (
              <button
                key={code}
                className={selectedDistrict === code ? "on" : ""}
                onClick={() => { onDistrictSelect(code); setOpen(false); setQuery(""); }}
              >
                <span className="dd-code">{code}</span>
                <span className="dd-name">{nameMap[code] ?? ""}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
