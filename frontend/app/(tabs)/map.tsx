import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { api, type City, type POI } from "@/src/api";
import { useApp } from "@/src/store";
import { colors, fonts, spacing } from "@/src/theme";

export default function MapScreen() {
  const { activeCityId } = useApp();
  const [city, setCity] = useState<City | null>(null);
  const [pois, setPois] = useState<POI[]>([]);
  const webRef = useRef<WebView>(null);

  useEffect(() => {
    (async () => {
      try {
        const [c, p] = await Promise.all([api.city(activeCityId), api.pois(activeCityId)]);
        setCity(c); setPois(p);
      } catch (e) { console.warn(e); }
    })();
  }, [activeCityId]);

  const html = useMemo(() => {
    if (!city) return "<html><body></body></html>";
    const markers = pois.map(p => ({
      id: p.id, name: p.name, cat: p.category, lat: p.lat, lng: p.lng, xp: p.xp_reward,
    }));
    const catColor: Record<string, string> = {
      landmark: "#C85A40", museum: "#6B705C", historic: "#D9953A",
      "must-see": "#4D7C5F", restaurant: "#B33939",
    };
    return `<!doctype html>
<html><head>
<meta name="viewport" content="initial-scale=1, width=device-width, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  html,body,#m{margin:0;padding:0;height:100%;background:#F0EFEB;font-family:-apple-system,system-ui,sans-serif}
  .pin{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;color:#fff;font-weight:700;font-size:13px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);}
  .leaflet-popup-content-wrapper{border-radius:14px}
  .leaflet-popup-content{margin:10px 14px;font-size:13px;}
  .pop-title{font-weight:700;color:#1A1816;margin-bottom:2px}
  .pop-meta{color:#6E6A63;font-size:11px}
  .pop-xp{display:inline-block;margin-top:6px;background:#FCE9E1;color:#C85A40;padding:2px 8px;border-radius:999px;font-weight:700;font-size:11px}
</style>
</head><body><div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  const map = L.map('m', { zoomControl: true, attributionControl: false }).setView([${city.lat}, ${city.lng}], 13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  const data = ${JSON.stringify(markers)};
  const catColor = ${JSON.stringify(catColor)};
  const initials = { landmark:'L', museum:'M', historic:'H', 'must-see':'★', restaurant:'F' };
  data.forEach(p => {
    const color = catColor[p.cat] || '#1A1816';
    const icon = L.divIcon({
      className:'', html:'<div class="pin" style="background:'+color+'">'+(initials[p.cat]||'?')+'</div>',
      iconSize:[34,34], iconAnchor:[17,17]
    });
    L.marker([p.lat,p.lng],{icon}).addTo(map)
      .bindPopup('<div class="pop-title">'+p.name+'</div><div class="pop-meta">'+p.cat.toUpperCase()+'</div><div class="pop-xp">+'+p.xp+' XP</div>');
  });
  if (data.length){
    const group = L.featureGroup(data.map(p=>L.marker([p.lat,p.lng])));
    map.fitBounds(group.getBounds().pad(0.25));
  }
</script></body></html>`;
  }, [city, pois]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="map-screen">
      <View style={styles.header}>
        <Text style={styles.kicker}>EXPLORE THE CITY</Text>
        <Text style={styles.h1}>{city?.name ?? "Loading..."}</Text>
        <View style={styles.legendRow}>
          <Legend dot="#C85A40" label="Landmark" />
          <Legend dot="#6B705C" label="Museum" />
          <Legend dot="#D9953A" label="Historic" />
          <Legend dot="#4D7C5F" label="Must-See" />
          <Legend dot="#B33939" label="Food" />
        </View>
      </View>
      <View style={styles.mapWrap}>
        <WebView
          ref={webRef}
          originWhitelist={["*"]}
          source={{ html }}
          style={{ flex: 1, backgroundColor: colors.surfaceTertiary }}
          javaScriptEnabled
          domStorageEnabled
        />
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
  mapWrap: { flex: 1, paddingBottom: 78 },
});
