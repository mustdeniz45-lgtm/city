import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { api, type City, type POI, type Progress } from "@/src/api";
import { useApp } from "@/src/store";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

const VISITED_COLOR = "#2E8B57"; // sea green for visited
const CAT_COLOR: Record<string, string> = {
  landmark: "#C85A40",
  museum: "#6B705C",
  historic: "#D9953A",
  "must-see": "#4D7C5F",
  restaurant: "#B33939",
};
const KY_COLOR = "#7A1F8F";

export default function MapScreen() {
  const { activeCityId, deviceId, progressVersion } = useApp();
  const router = useRouter();
  const [city, setCity] = useState<City | null>(null);
  const [pois, setPois] = useState<POI[]>([]);
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const webRef = useRef<WebView>(null);

  // Load city + places
  useEffect(() => {
    (async () => {
      try {
        const [c, all] = await Promise.all([api.city(activeCityId), api.pois(activeCityId)]);
        setCity(c);
        setPois(all.sort((a, b) => (a.ky_seq ?? 9999) - (b.ky_seq ?? 9999)));
      } catch (e) { console.warn(e); }
    })();
  }, [activeCityId]);

  // Load visited list (refresh on focus + when progress changes globally)
  const loadVisited = useCallback(async () => {
    if (!deviceId) return;
    try {
      const p: Progress = await api.progress(deviceId);
      const ids = new Set<string>();
      (p.check_ins || []).forEach((ci) => { if (ci.poi_id) ids.add(ci.poi_id); });
      setVisited(ids);
    } catch (e) { /* anonymous user with no progress yet */ }
  }, [deviceId]);
  useEffect(() => { loadVisited(); }, [loadVisited, progressVersion]);
  useFocusEffect(useCallback(() => { loadVisited(); }, [loadVisited]));

  const html = useMemo(() => {
    if (!city) return "<html><body></body></html>";
    const places = pois.map((p) => ({
      id: p.id,
      name: p.name,
      tr: p.name_tr ?? "",
      cat: p.category,
      seq: p.ky_seq ?? null,
      lat: p.lat,
      lng: p.lng,
      xp: p.xp_reward,
      visited: visited.has(p.id),
    }));

    return `<!doctype html>
<html><head>
<meta name="viewport" content="initial-scale=1, width=device-width, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css"/>
<style>
  html,body,#m{margin:0;padding:0;height:100%;background:#F0EFEB;font-family:-apple-system,system-ui,sans-serif}
  .pin{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;color:#fff;font-weight:800;font-size:12px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);}
  .pin.visited{box-shadow:0 0 0 3px rgba(46,139,87,0.25),0 2px 6px rgba(46,139,87,0.5);}
  .pin .check{font-size:14px;line-height:1}
  .leaflet-popup-content-wrapper{border-radius:14px;min-width:220px}
  .leaflet-popup-content{margin:12px 14px;font-size:13px;}
  .pop-title{font-weight:700;color:#1A1816;margin-bottom:2px;font-size:14px}
  .pop-tr{font-style:italic;color:#6E6A63;font-size:11px;margin-bottom:6px}
  .pop-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;margin-bottom:8px}
  .chip{display:inline-block;padding:2px 8px;border-radius:999px;font-weight:700;font-size:10px;letter-spacing:0.3px}
  .chip.cat{background:#FCE9E1;color:#C85A40}
  .chip.ky{background:#F3E1F8;color:#7A1F8F}
  .chip.visited{background:#E1F5E9;color:#2E8B57}
  .chip.xp{background:#FFF6E2;color:#C09030}
  .btn-row{display:flex;gap:6px;margin-top:8px}
  .btn{flex:1;padding:8px 10px;border-radius:999px;border:none;font-weight:700;font-size:11.5px;cursor:pointer;letter-spacing:0.2px;display:flex;align-items:center;justify-content:center;gap:4px}
  .btn-primary{background:#C85A40;color:#fff}
  .btn-secondary{background:#F0EFEB;color:#1A1816;border:1px solid #E1DED6}
  .btn svg{width:12px;height:12px;flex:0 0 12px}

  /* Custom cluster styling — matches CityQuest palette.
     Using !important because leaflet.markercluster injects its own
     .marker-cluster wrapper class that our divIcon inherits. */
  .marker-cluster{background:transparent !important;}
  .marker-cluster div{background:transparent !important;margin:0 !important;width:100% !important;height:100% !important;}
  .cq-cluster{
    display:flex !important;align-items:center;justify-content:center;flex-direction:column;
    color:#fff !important;font-weight:800 !important;font-family:-apple-system,system-ui,sans-serif;
    border-radius:50%;border:3px solid #fff;
    box-shadow:0 2px 10px rgba(0,0,0,0.28);
    transition:transform 120ms ease;
    box-sizing:border-box;
  }
  .cq-cluster:hover{transform:scale(1.06)}
  .cq-cluster-sm{width:38px !important;height:38px !important;font-size:13px !important;background:#C85A40 !important;}
  .cq-cluster-md{width:46px !important;height:46px !important;font-size:14px !important;background:#B14A32 !important;}
  .cq-cluster-lg{width:56px !important;height:56px !important;font-size:16px !important;background:#8E3823 !important;box-shadow:0 0 0 6px rgba(200,90,64,0.18),0 2px 10px rgba(0,0,0,0.28);}
  /* Green ring when the cluster's places are mostly visited */
  .cq-cluster.done-mostly{background:#2E8B57 !important;box-shadow:0 0 0 5px rgba(46,139,87,0.18),0 2px 10px rgba(0,0,0,0.25);}
  .cq-cluster.done-all{background:#1E6B42 !important;box-shadow:0 0 0 6px rgba(46,139,87,0.28),0 2px 10px rgba(0,0,0,0.28);}
  .cq-cluster .cnt{line-height:1;display:block}
  .cq-cluster .tick{font-size:9px;margin-top:1px;opacity:0.9;letter-spacing:0.4px;display:block}
</style>
</head><body><div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
<script>
  const map = L.map('m', { zoomControl: true, attributionControl: false }).setView([${city.lat}, ${city.lng}], 13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  const places = ${JSON.stringify(places)};
  const catColor = ${JSON.stringify(CAT_COLOR)};
  const KY_COLOR = ${JSON.stringify(KY_COLOR)};
  const VISITED = ${JSON.stringify(VISITED_COLOR)};
  const markers = [];

  // Marker cluster group — auto groups nearby pins into a single badge with
  // the count of places in that area. At zoom >= 17 (street level) each pin
  // is shown individually so users can pick specific places.
  const cluster = L.markerClusterGroup({
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    zoomToBoundsOnClick: true,
    maxClusterRadius: 55,
    disableClusteringAtZoom: 17,
    iconCreateFunction: function(c) {
      const kids = c.getAllChildMarkers();
      const total = kids.length;
      let visitedCount = 0;
      for (let i = 0; i < kids.length; i++) if (kids[i].__visited) visitedCount++;
      const ratio = visitedCount / total;

      const sizeCls = total < 5 ? 'cq-cluster-sm' : total < 15 ? 'cq-cluster-md' : 'cq-cluster-lg';
      const dim = total < 5 ? 38 : total < 15 ? 46 : 56;
      const doneCls = ratio === 1 ? 'done-all' : ratio >= 0.6 ? 'done-mostly' : '';
      const sub = visitedCount > 0
        ? '<span class="tick">' + visitedCount + '/' + total + ' &#10003;</span>'
        : '';
      return L.divIcon({
        className: 'cq-cluster-wrap',
        html: '<div class="cq-cluster ' + sizeCls + ' ' + doneCls + '" aria-label="' + total + ' places in this area">'
          + '<span class="cnt">' + total + '</span>' + sub + '</div>',
        iconSize: [dim, dim], iconAnchor: [dim / 2, dim / 2]
      });
    }
  });

  // Bridge: send messages back to RN / parent web for nav + directions
  function send(msg) {
    try {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      else if (window.parent) window.parent.postMessage(JSON.stringify(msg), '*');
    } catch(e) {}
  }
  window.openDirections = function(lat,lng,name){
    var url = 'https://www.google.com/maps/dir/?api=1&destination='+lat+','+lng+'&destination_place_id='+encodeURIComponent(name);
    if (window.ReactNativeWebView) {
      send({ type:'directions', url:url });
    } else {
      window.open(url, '_blank');
    }
  };
  window.openDetails = function(id){
    send({ type:'details', poi_id:id });
  };

  places.forEach(p => {
    var color = p.visited ? VISITED : (p.seq ? KY_COLOR : (catColor[p.cat] || '#1A1816'));
    var label = p.visited ? '<span class="check">&#10003;</span>' : (p.seq ? String(p.seq) : (
        {landmark:'L', museum:'M', historic:'H', 'must-see':'★', restaurant:'F'}[p.cat] || '·'
      ));
    var icon = L.divIcon({
      className:'', html:'<div class="pin '+(p.visited?'visited':'')+'" style="background:'+color+'">'+label+'</div>',
      iconSize:[30,30], iconAnchor:[15,15]
    });

    var popupHtml =
      '<div class="pop-title">'+(p.seq?p.seq+'. ':'')+escapeHtml(p.name)+'</div>'+
      (p.tr ? '<div class="pop-tr">'+escapeHtml(p.tr)+'</div>' : '')+
      '<div class="pop-row">'+
        '<span class="chip cat">'+p.cat.toUpperCase()+'</span>'+
        (p.seq ? '<span class="chip ky">KÜLTÜR YOLU · #'+p.seq+'</span>' : '')+
        (p.visited ? '<span class="chip visited">✓ VISITED</span>' : '')+
        '<span class="chip xp">+'+p.xp+' XP</span>'+
      '</div>'+
      '<div class="btn-row">'+
        '<button class="btn btn-secondary" onclick="openDirections('+p.lat+','+p.lng+',\\''+jsEscape(p.name)+'\\')">Directions</button>'+
        '<button class="btn btn-primary" onclick="openDetails(\\''+jsEscape(p.id)+'\\')">Details</button>'+
      '</div>';

    var m = L.marker([p.lat, p.lng], { icon }).bindPopup(popupHtml, { maxWidth: 280 });
    m.__visited = !!p.visited;
    cluster.addLayer(m);
    markers.push(m);
  });

  map.addLayer(cluster);

  if (markers.length){
    const group = L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.15));
  }

  function escapeHtml(s){ return String(s||'').replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }
  function jsEscape(s){ return String(s||'').replace(/'/g,"\\\\'"); }
</script></body></html>`;
  }, [city, pois, visited]);

  // Listen for messages from the iframe (web) / WebView (native) to handle button taps
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onMsg = (event: MessageEvent) => {
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        handleMsg(data);
      } catch {}
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  function handleMsg(data: any) {
    if (!data || typeof data !== "object") return;
    if (data.type === "details" && data.poi_id) {
      router.push(`/poi/${data.poi_id}`);
    } else if (data.type === "directions" && data.url) {
      Linking.openURL(data.url);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="map-screen">
      <View style={styles.header}>
        <Text style={styles.kicker}>EXPLORE THE CITY</Text>
        <Text style={styles.h1}>{city?.name ?? "Loading..."}</Text>
        <View style={styles.legendRow}>
          <Legend dot={VISITED_COLOR} label="Visited" />
          <Legend dot={KY_COLOR} label="Kültür Yolu" />
          <Legend dot={CAT_COLOR.landmark} label="Landmark" />
          <Legend dot={CAT_COLOR.museum} label="Museum" />
          <Legend dot={CAT_COLOR.historic} label="Historic" />
          <Legend dot={CAT_COLOR.restaurant} label="Food" />
        </View>
        <Text style={styles.hint}>
          <Ionicons name="information-circle-outline" size={11} color={colors.muted} />
          {`  Nearby places are grouped — tap a cluster or zoom in to expand.`}
        </Text>
        {visited.size > 0 && (
          <Text style={styles.progressNote}>
            <Ionicons name="checkmark-circle" size={11} color={VISITED_COLOR} />
            {`  You've visited ${visited.size} of ${pois.length} places.`}
          </Text>
        )}
      </View>
      <View style={styles.mapWrap}>
        {Platform.OS === "web" ? (
          // @ts-expect-error iframe is a valid web-only element via react-native-web
          <iframe srcDoc={html} style={{ flex: 1, border: 0, width: "100%", height: "100%" }} title="map" />
        ) : (
          <WebView
            ref={webRef}
            originWhitelist={["*"]}
            source={{ html }}
            style={{ flex: 1, backgroundColor: colors.surfaceTertiary }}
            javaScriptEnabled
            domStorageEnabled
            onMessage={(e) => {
              try { handleMsg(JSON.parse(e.nativeEvent.data)); } catch {}
            }}
          />
        )}
      </View>
    </View>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <View style={styles.legend}>
      <View style={[styles.legendDot, { backgroundColor: dot }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.xxxl + spacing.md, paddingBottom: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  kicker: { fontSize: 11, letterSpacing: 2, fontWeight: "700", color: colors.brand },
  h1: { fontFamily: fonts.display, fontSize: 28, color: colors.onSurface, marginTop: 4, marginBottom: spacing.sm },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.xs },
  legend: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: colors.muted, fontWeight: "600" },
  progressNote: { marginTop: spacing.sm, fontSize: 11, color: colors.muted, fontWeight: "600" },
  hint: { marginTop: spacing.xs, fontSize: 10.5, color: colors.muted, fontStyle: "italic" },
  mapWrap: { flex: 1, paddingBottom: 78 },
});
