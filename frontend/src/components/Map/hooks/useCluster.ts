/**
 * Supercluster wrapper — indexes a POI list once and returns memoized
 * getters for `getClusters(bbox, zoom)` and `getClusterExpansionZoom`.
 *
 * We do clustering client-side (not via MapLibre's built-in cluster) so we
 * can style clusters with our custom `Marker` React components and share
 * the exact same logic between the future web-fallback rendering path.
 */
import { useMemo } from "react";
import Supercluster from "supercluster";
import type { MapPOI, PoiFeature } from "../types";
import { poisToFeatureCollection } from "../types";

export function useCluster(pois: MapPOI[]) {
  const index = useMemo(() => {
    const fc = poisToFeatureCollection(pois);
    const sc = new Supercluster<PoiFeature["properties"]>({
      radius: 55,
      maxZoom: 16, // above zoom 16 markers de-cluster
      minPoints: 3,
    });
    sc.load(fc.features as any);
    return sc;
  }, [pois]);
  return index;
}
