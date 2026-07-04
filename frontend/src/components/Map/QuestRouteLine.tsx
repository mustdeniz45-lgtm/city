/**
 * Renders one or more polyline routes on the map. Each route is a plain
 * array of `[lng, lat]` pairs — the exact shape produced by the current
 * quest requirement resolver as well as future AI route generators.
 *
 * The component is a thin wrapper around `ShapeSource + LineLayer` so it
 * respects the CityQuest architecture rule: pure React Native + typed
 * props, no imperative MapLibre calls at call sites.
 */
import React, { memo, useMemo } from "react";
import MapLibreGL from "@maplibre/maplibre-react-native";
import type { RouteFeature } from "./types";

type Props = { routes: RouteFeature[] };

function QuestRouteLineImpl({ routes }: Props) {
  const collection = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: routes.map((r) => ({
        type: "Feature" as const,
        properties: { id: r.id, color: r.color ?? "#C85A40" },
        geometry: { type: "LineString" as const, coordinates: r.coordinates },
      })),
    }),
    [routes]
  );

  if (routes.length === 0) return null;
  return (
    <MapLibreGL.ShapeSource id="cq-routes" shape={collection as any}>
      <MapLibreGL.LineLayer
        id="cq-routes-line"
        style={{
          lineColor: ["get", "color"],
          lineWidth: 3.5,
          lineOpacity: 0.85,
          lineCap: "round",
          lineJoin: "round",
        }}
      />
    </MapLibreGL.ShapeSource>
  );
}

export const QuestRouteLine = memo(QuestRouteLineImpl);
