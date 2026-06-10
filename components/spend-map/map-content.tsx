"use client";

import { useEffect, useRef, type RefObject } from "react";
import { MapContainer, GeoJSON, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MapType } from "@/lib/types";

interface MapContentProps {
  geojson: any;
  spendingMap: Map<string, number>;
  selectedDistrict: string;
  fetchedDistrict: string;
  onDistrictClick: (district: string) => void;
  mapType: MapType;
  theme?: "dark" | "light";
}

// 1. STANDART MOD RENK SKALASI (Eski fonksiyonumuz)
function getStandardColor(value: number | undefined): string {
  if (value === undefined || value === 0) return "#f1f5f9";
  const normalized = Math.min(value / 2.0, 1);
  if (normalized < 0.25) return "#bad8eb";
  if (normalized < 0.5) return "#7fb2d6";
  if (normalized < 0.75) return "#f7b8a1";
  return "#f28b82";
}

// 2. YENİ: FARK (DİFFERENCE) MODU RENK SKALASI (Kırmızı - Yeşil)
function getDiffColor(value: number | undefined): string {
  if (value === undefined || value === 0) return "#f1f5f9"; // Değişim yoksa gri

  // DÜŞÜŞ (Kırmızı Tonları)
  if (value <= -2.0) return "#991b1b"; // Koyu Kırmızı (Çok düşüş)
  if (value <= -0.5) return "#ef4444"; // Kırmızı (Orta düşüş)
  if (value < 0) return "#fca5a5"; // Açık Kırmızı (Hafif düşüş)

  // ARTIŞ (Yeşil Tonları)
  if (value >= 2.0) return "#065f46"; // Koyu Yeşil (Çok artış)
  if (value >= 0.5) return "#10b981"; // Yeşil (Orta artış)
  return "#a7f3d0"; // Açık Yeşil (Hafif artış)
}

function ZoomToDistrict({
  fetchedDistrict,
  geoJsonLayerRef,
}: {
  fetchedDistrict: string;
  geoJsonLayerRef: RefObject<L.GeoJSON | null>;
}) {
  const map = useMap();

  useEffect(() => {
    if (!fetchedDistrict || !geoJsonLayerRef.current) return;
    geoJsonLayerRef.current.eachLayer((layer: any) => {
      if (layer.feature?.properties?.name === fetchedDistrict) {
        map.fitBounds(layer.getBounds(), { padding: [120, 120], maxZoom: 9, animate: true });
      }
    });
    // Cancel any in-flight zoom animation before unmount to prevent
    // _onZoomTransitionEnd from firing on a destroyed map (_mapPane deleted)
    return () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (map as any)._animatingZoom = false;
      } catch {
        // map may already be removed — safe to ignore
      }
    };
  }, [fetchedDistrict, map, geoJsonLayerRef]);

  return null;
}

function CustomMapControls() {
  const map = useMap();
  return (
    <div className="absolute bottom-10 right-4 z-[400] flex flex-col gap-2">
      <Button
        size="icon"
        variant="outline"
        className="h-9 w-9 bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-50 border-gray-200 shadow-sm rounded-lg"
        onClick={() => map.zoomIn()}
      >
        <ZoomIn className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="outline"
        className="h-9 w-9 bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-50 border-gray-200 shadow-sm rounded-lg"
        onClick={() => map.zoomOut()}
      >
        <ZoomOut className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="outline"
        className="h-9 w-9 bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-50 border-gray-200 shadow-sm rounded-lg"
        onClick={() => map.setView([54.5, -3], 6)}
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default function MapContent({
  geojson,
  spendingMap,
  selectedDistrict,
  fetchedDistrict,
  onDistrictClick,
  mapType,
  theme = "dark",
}: MapContentProps) {
  const geoJsonLayerRef = useRef<L.GeoJSON>(null);
  const stateRefs = useRef({ selectedDistrict, fetchedDistrict, mapType, theme });

  useEffect(() => {
    stateRefs.current = { selectedDistrict, fetchedDistrict, mapType, theme };
  }, [selectedDistrict, fetchedDistrict, mapType, theme]);

  useEffect(() => {
    if (geoJsonLayerRef.current) {
      geoJsonLayerRef.current.eachLayer((layer: any) => {
        const postcode = layer.feature.properties.name || "";
        const value = spendingMap.get(postcode);

        const isFetched = postcode === fetchedDistrict;
        const isPending =
          postcode === selectedDistrict && postcode !== fetchedDistrict;

        // HANGİ RENK FONKSİYONUNU KULLANACAĞIZ?
        const fillColor =
          mapType === "difference"
            ? getDiffColor(value)
            : getStandardColor(value);

        const borderColor = theme === "light" ? "#cbd5df" : "#ffffff";
        layer.setStyle({
          fillColor: fillColor,
          weight: isFetched ? 3 : isPending ? 3 : 1,
          color: isFetched ? "#0d1522" : isPending ? "#3b82f6" : borderColor,
          dashArray: isPending ? "6, 6" : "",
          fillOpacity: isFetched ? 1 : 0.85,
        });

        // setStyle className'i kaldırmaz, DOM'u elle temizle
        if (layer._path) {
          layer._path.classList.remove("elevated-polygon");
          if (isFetched) layer._path.classList.add("elevated-polygon");
        }

        if (isPending) layer.bringToFront();
        if (isFetched) layer.bringToFront();

        // TOOLTIP DEĞİŞİMİ: Fark modundaysa önüne "+" veya "-" işareti koysun
        const formattedValue =
          value !== undefined
            ? mapType === "difference" && value > 0
              ? `+${value.toFixed(2)}`
              : value.toFixed(3)
            : "No data";

        const labelText =
          mapType === "difference" ? "Spend Diff:" : "Spend Index:";

        const tooltipContent = `
          <div style="background: white; color: #151c2c; padding: 10px 14px; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05); font-family: inherit;">
            <div style="font-weight: 600; font-size: 13px; margin-bottom: 2px;">${postcode}</div>
            <div style="font-size: 12px; color: ${value ? "#64748b" : "#94a3b8"};">
              ${labelText} <span style="font-weight: 700; color: ${mapType === "difference" ? (value && value < 0 ? "#ef4444" : "#10b981") : "#151c2c"};">${formattedValue}</span>
            </div>
          </div>
        `;
        layer.setTooltipContent(tooltipContent);
      });
    }
  }, [spendingMap, selectedDistrict, fetchedDistrict, mapType, theme]);

  const initialStyle = (feature: any) => {
    const postcode = feature.properties.name || "";
    const value = spendingMap.get(postcode);

    const isFetched = postcode === fetchedDistrict;
    const isPending =
      postcode === selectedDistrict && postcode !== fetchedDistrict;

    // ÇÖZÜM BURADA: Hangi moddaysak onun renk fonksiyonunu çağırıyoruz
    const fillColor =
      mapType === "difference" ? getDiffColor(value) : getStandardColor(value);

    const borderColor = theme === "light" ? "#cbd5df" : "#ffffff";
    return {
      fillColor: fillColor,
      weight: isFetched ? 3 : isPending ? 3 : 1,
      color: isFetched ? "#0d1522" : isPending ? "#3b82f6" : borderColor,
      dashArray: isPending ? "6, 6" : "",
      fillOpacity: isFetched ? 1 : 0.85,
      className: isFetched ? "elevated-polygon outline-none" : "outline-none",
    };
  };

  const onEachFeature = (feature: any, layer: L.Layer) => {
    const postcode = feature.properties.name || "";

    layer.on({
      click: () => onDistrictClick(postcode),
      mouseover: (e) => {
        const target = e.target;
        // Bayat state'ler yerine canlı referanstan okuyoruz
        const currentSelected = stateRefs.current.selectedDistrict;
        const currentFetched = stateRefs.current.fetchedDistrict;

        if (postcode !== currentFetched && postcode !== currentSelected) {
          target.setStyle({
            weight: 2,
            color: "#cbd5e1",
            fillOpacity: 0.4,
            dashArray: "",
          });
        }
      },
      mouseout: (e) => {
        const target = e.target;
        // Bayat state'ler yerine canlı referanstan okuyoruz
        const currentSelected = stateRefs.current.selectedDistrict;
        const currentFetched = stateRefs.current.fetchedDistrict;

        if (postcode !== currentFetched && postcode !== currentSelected) {
          // Normal bir bölgeden çıkarken her şeyi varsayılana döndür
          target.setStyle({
            weight: 1,
            color: "#ffffff",
            fillOpacity: 0.85,
            dashArray: "",
          });
        }
      },
    });

    layer.bindTooltip("", {
      sticky: true,
      className: "custom-tooltip",
      direction: "auto",
    });
  };

  return (
    <>
      <style>{`
        path.leaflet-interactive:focus, .leaflet-container:focus {
          outline: none !important;
        }
        path.elevated-polygon {
          filter: drop-shadow(0px 12px 15px rgba(13, 21, 34, 0.45)) !important;
          transition: filter 0.3s cubic-bezier(0.4, 0, 0.2, 1), fill-opacity 0.3s ease;
        }
      `}</style>

      <MapContainer
        center={[54.5, -3]}
        zoom={6}
        minZoom={5}
        maxZoom={12}
        zoomControl={false}
        attributionControl={false}
        zoomSnap={0.25}
        zoomDelta={0.25}
        wheelPxPerZoomLevel={120}
        className="focus:outline-none"
        style={{ height: "100%", width: "100%", background: theme === "light" ? "#e8edf4" : "#1f2b41" }}
      >
        <CustomMapControls />
        <ZoomToDistrict fetchedDistrict={fetchedDistrict} geoJsonLayerRef={geoJsonLayerRef} />
        <GeoJSON
          ref={geoJsonLayerRef}
          data={geojson}
          style={initialStyle}
          onEachFeature={onEachFeature}
        />
      </MapContainer>
    </>
  );
}
