"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { DISCOVERY_MAX_RADIUS_KM } from "@repo/validation";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/cn";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Slider } from "@repo/ui/misc";
import { api, ApiError } from "@/lib/api-client";
import type { MapArea, MapPin as Pin } from "./area-map";

// Leaflet needs the browser; load the map only when it's shown.
const AreaMap = dynamic(() => import("./area-map").then((m) => m.AreaMap), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-lg border bg-muted" />,
});

export type LocationMode = "places" | "map";

interface Place {
  label: string;
  lat: number;
  lon: number;
  city: string | null;
  country: string | null;
}

/** Where to search: typed countries / cities, or a circle on the map. */
export function DiscoveryLocation({
  mode,
  onModeChange,
  countries,
  onCountriesChange,
  cities,
  onCitiesChange,
  area,
  onAreaChange,
  pins,
  disabled,
}: {
  mode: LocationMode;
  onModeChange: (mode: LocationMode) => void;
  countries: string;
  onCountriesChange: (value: string) => void;
  cities: string;
  onCitiesChange: (value: string) => void;
  area: MapArea | null;
  onAreaChange: (area: MapArea | null) => void;
  pins: Pin[];
  disabled: boolean;
}) {
  const [radiusKm, setRadiusKm] = useState(area?.radiusKm ?? 10);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [focus, setFocus] = useState<{
    lat: number;
    lon: number;
    zoom: number;
    key: number;
  } | null>(null);
  const labelRequest = useRef(0);
  const focusSeq = useRef(0);

  async function findPlaces(q: string): Promise<Place[]> {
    const { places } = await api<{ places: Place[] }>(
      `/api/sales/discovery/places?q=${encodeURIComponent(q)}`,
    );
    return places;
  }

  // First time on the map: centre it on the ideal-customer city or country.
  const centred = useRef(false);
  useEffect(() => {
    if (mode !== "map" || area || centred.current) return;
    centred.current = true;
    const hint = cities.split(",")[0]?.trim() || countries.split(",")[0]?.trim();
    if (!hint) return;
    void findPlaces(hint)
      .then(([place]) => {
        if (place)
          setFocus({
            lat: place.lat,
            lon: place.lon,
            zoom: place.city ? 11 : 6,
            key: ++focusSeq.current,
          });
      })
      .catch(() => undefined);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  async function search(event?: React.FormEvent | React.KeyboardEvent) {
    event?.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    setSearchError(null);
    try {
      setResults(await findPlaces(query.trim()));
    } catch (e) {
      setSearchError(e instanceof ApiError ? e.message : "Place search failed. Try again.");
    } finally {
      setSearching(false);
    }
  }

  function choose(place: Place) {
    onAreaChange({ lat: place.lat, lon: place.lon, radiusKm, label: place.label });
    setFocus({ lat: place.lat, lon: place.lon, zoom: 12, key: ++focusSeq.current });
    setResults(null);
    setQuery("");
  }

  /** A click on the map: move the centre, then name the place (best effort). */
  function pick(point: { lat: number; lon: number }) {
    onAreaChange({ ...point, radiusKm });
    const request = ++labelRequest.current;
    void api<{ place: Place | null }>(
      `/api/sales/discovery/places/reverse?lat=${point.lat.toFixed(6)}&lon=${point.lon.toFixed(6)}`,
    )
      .then(({ place }) => {
        if (place && request === labelRequest.current)
          onAreaChange({ ...point, radiusKm, label: place.label });
      })
      .catch(() => undefined);
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Where</legend>
      <div
        role="radiogroup"
        aria-label="Where to search"
        className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/40 p-1"
      >
        {(
          [
            ["places", "Countries & cities"],
            ["map", "Area on a map"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            disabled={disabled}
            onClick={() => onModeChange(value)}
            className={cn(
              "rounded-md px-2 py-1.5 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              mode === value
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "places" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="d-countries">Countries</Label>
            <Input
              id="d-countries"
              value={countries}
              onChange={(e) => onCountriesChange(e.target.value)}
              placeholder="Lebanon, Jordan"
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-cities">Cities (optional)</Label>
            <Input
              id="d-cities"
              value={cities}
              onChange={(e) => onCitiesChange(e.target.value)}
              placeholder="Beirut, Amman"
              disabled={disabled}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Label htmlFor="d-place" className="sr-only">
              Search for a place
            </Label>
            <div className="flex gap-2">
              <Input
                id="d-place"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void search(e);
                }}
                placeholder="Search a place, e.g. Hamra, Beirut"
                disabled={disabled}
                autoComplete="off"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Search place"
                onClick={() => void search()}
                disabled={disabled || searching || query.trim().length < 2}
              >
                {searching ? <Loader2 className="animate-spin" /> : <Search />}
              </Button>
            </div>
            {results ? (
              <ul className="absolute z-[1000] mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-lg">
                {results.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-muted-foreground">No places found.</li>
                ) : (
                  results.map((place) => (
                    <li key={`${place.lat},${place.lon}`}>
                      <button
                        type="button"
                        className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => choose(place)}
                      >
                        <MapPin
                          className="mt-0.5 size-3.5 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        {place.label}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
            {searchError ? (
              <p className="mt-1 text-xs text-destructive" role="alert">
                {searchError}
              </p>
            ) : null}
          </div>

          <AreaMap area={area} onPick={pick} focus={focus} pins={pins} disabled={disabled} />

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <Label htmlFor="d-radius">Radius</Label>
              <span className="text-muted-foreground tabular-nums">{radiusKm} km</span>
            </div>
            <Slider
              id="d-radius"
              aria-label="Search radius in kilometres"
              min={1}
              max={DISCOVERY_MAX_RADIUS_KM}
              step={1}
              value={[radiusKm]}
              disabled={disabled}
              onValueChange={([value]) => {
                const next = value ?? radiusKm;
                setRadiusKm(next);
                if (area) onAreaChange({ ...area, radiusKm: next });
              }}
            />
          </div>

          <p className="flex items-start gap-1.5 text-xs text-muted-foreground" role="status">
            {area ? (
              <>
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="flex-1">
                  Within {area.radiusKm} km of{" "}
                  {area.label ?? `${area.lat.toFixed(4)}, ${area.lon.toFixed(4)}`}. Drag the dot or
                  click elsewhere to move it.
                </span>
                <button
                  type="button"
                  className="inline-flex items-center gap-0.5 hover:text-foreground"
                  onClick={() => onAreaChange(null)}
                  disabled={disabled}
                >
                  <X className="size-3" aria-hidden="true" /> Clear
                </button>
              </>
            ) : (
              "Search a place or click the map to choose the centre of the area."
            )}
          </p>
        </div>
      )}
    </fieldset>
  );
}
