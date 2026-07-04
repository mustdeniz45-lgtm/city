/**
 * Shared types for the CityQuest map layer.
 */
import type { Feature, Point } from "geojson";
import type { MapTheme } from "./hooks/useMapStyle";

export type MarkerKind = "quest" | "restaurant" | "museum" | "landmark" | "historic" | "kultur-yolu";

export type MapPOI = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category?: string;
  kultur_yolu?: boolean;
  ky_seq?: number | null;
  visited?: boolean;
};

export type PoiProperties = {
  id: string;
  name: string;
  kind: MarkerKind;
  visited: boolean;
  ky_seq?: number | null;
};

export type PoiFeature = Feature<Point, PoiProperties>;

export type RouteCoord = [number, number];
export type RouteFeature = {
  id: string;
  coordinates: RouteCoord[];
  color?: string;
};

export type OnPoiPressed = (poi: MapPOI) => void;

export type CityQuestMapProps = {
  city: { lat: number; lng: number; zoom?: number };
  pois: MapPOI[];
  routes?: RouteFeature[];
  onPoiPress?: OnPoiPressed;
  followUser?: boolean;
  theme?: MapTheme;
};

export function mapPoiKind(poi: MapPOI): MarkerKind {
  if (poi.kultur_yolu) return "kultur-yolu";
  const c = (poi.category || "").toLowerCase();
  if (c === "restaurant" || c === "food") return "restaurant";
  if (c === "museum") return "museum";
  if (c === "landmark") return "landmark";
  if (c === "historic") return "historic";
  return "quest";
}

export function poisToFeatureCollection(pois: MapPOI[]) {
  return {
    type: "FeatureCollection" as const,
    features: pois
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
      .map<PoiFeature>((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        properties: {
          id: p.id,
          name: p.name,
          kind: mapPoiKind(p),
          visited: !!p.visited,
          ky_seq: p.ky_seq ?? null,
        },
      })),
  };
}
