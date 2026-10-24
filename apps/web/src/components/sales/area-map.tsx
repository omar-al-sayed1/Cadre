"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import type { Circle, LayerGroup, Map as LeafletMap, Marker } from "leaflet";
import { cn } from "@repo/ui/cn";
import { useLatest } from "@/hooks/use-latest";

export interface MapArea {
  lat: number;
  lon: number;
  radiusKm: number;
  label?: string;
}

export interface MapPin {
  id: string;
  lat: number;
  lon: number;
  label: string;
  added: boolean;
}

/** OpenStreetMap tiles by default; set NEXT_PUBLIC_MAP_TILE_URL for another provider. */
export const MAP_TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

const CENTER_ICON_HTML =
  '<span class="block size-5 rounded-full border-[3px] border-white bg-primary shadow-md"></span>';

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** A sensible zoom so the whole circle is visible. */
function zoomFor(radiusKm: number): number {
  return Math.max(4, Math.min(15, Math.round(14 - Math.log2(Math.max(radiusKm, 0.5)))));
}

/**
 * Pick a search area: click (or drag the centre) to move it; the radius comes
 * from the parent. Shows the companies a run found as pins.
 */
export function AreaMap({
  area,
  onPick,
  focus,
  pins = [],
  disabled = false,
  className,
}: {
  area: MapArea | null;
  onPick: (point: { lat: number; lon: number }) => void;
  /** Pan / zoom here (e.g. a place chosen in the search box). */
  focus?: { lat: number; lon: number; zoom: number; key: number } | null;
  pins?: MapPin[];
  disabled?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const circleRef = useRef<Circle | null>(null);
  const centerRef = useRef<Marker | null>(null);
  const pinsRef = useRef<LayerGroup | null>(null);
  const onPickRef = useLatest(onPick);
  const disabledRef = useLatest(disabled);
  const initial = useRef({ area, focus });
  // Bumped once the map exists, so the drawing effects run against it.
  const [ready, setReady] = useState(0);

  // Create the map once (Leaflet needs the browser, so it loads on the client).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;
      const start = initial.current.area ?? initial.current.focus;
      const map = L.map(containerRef.current, {
        center: start ? [start.lat, start.lon] : [25, 20],
        zoom: initial.current.area
          ? zoomFor(initial.current.area.radiusKm)
          : (initial.current.focus?.zoom ?? 2),
        worldCopyJump: true,
      });
      L.tileLayer(MAP_TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);
      map.on("click", (e) => {
        if (!disabledRef.current) onPickRef.current({ lat: e.latlng.lat, lon: e.latlng.lng });
      });
      pinsRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady((n) => n + 1);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Circle + draggable centre.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (!area) {
      circleRef.current?.remove();
      centerRef.current?.remove();
      circleRef.current = null;
      centerRef.current = null;
      return;
    }
    const center: [number, number] = [area.lat, area.lon];
    if (!circleRef.current) {
      circleRef.current = L.circle(center, {
        radius: area.radiusKm * 1000,
        // Leaflet sets SVG attributes, which can't read CSS variables: theme classes win instead.
        className: "stroke-primary fill-primary",
        weight: 2,
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(map);
      centerRef.current = L.marker(center, {
        draggable: !disabled,
        keyboard: false,
        icon: L.divIcon({
          className: "",
          html: CENTER_ICON_HTML,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        }),
        title: "Search centre (drag to move)",
      }).addTo(map);
      centerRef.current.on("dragend", () => {
        const p = centerRef.current!.getLatLng();
        onPickRef.current({ lat: p.lat, lon: p.lng });
      });
      map.fitBounds(circleRef.current.getBounds(), { padding: [16, 16] });
    } else {
      circleRef.current.setLatLng(center).setRadius(area.radiusKm * 1000);
      centerRef.current?.setLatLng(center);
      const bounds = circleRef.current.getBounds();
      if (!map.getBounds().contains(bounds)) map.fitBounds(bounds, { padding: [16, 16] });
    }
  }, [ready, area?.lat, area?.lon, area?.radiusKm, disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pan to a searched place.
  useEffect(() => {
    if (focus && mapRef.current) mapRef.current.setView([focus.lat, focus.lon], focus.zoom);
  }, [ready, focus?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Result pins.
  useEffect(() => {
    const L = leafletRef.current;
    const layer = pinsRef.current;
    if (!L || !layer) return;
    layer.clearLayers();
    for (const pin of pins) {
      L.circleMarker([pin.lat, pin.lon], {
        radius: 7,
        className: pin.added ? "stroke-background fill-success" : "stroke-background fill-primary",
        weight: 2,
        fillOpacity: 1,
      })
        .bindTooltip(escapeHtml(pin.label))
        .addTo(layer);
    }
  }, [ready, pins]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Map: click to choose the centre of the search area"
      className={cn(
        "z-0 h-64 w-full overflow-hidden rounded-lg border bg-muted",
        disabled && "pointer-events-none opacity-60",
        className,
      )}
    />
  );
}
