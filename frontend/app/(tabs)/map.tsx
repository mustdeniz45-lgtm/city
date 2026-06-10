import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { api, type City, type POI } from "@/src/api";
import { useApp } from "@/src/store";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

export default function MapScreen() {
  const { activeCityId } = useApp();
  const [city, setCity] = useState<City | null>(null);
  const [pois, setPois] = useState<POI[]>([]);
  const [kyPois, setKyPois] = useState<POI[]>([]);
  const [showKY, setShowKY] = useState(false);
  const webRef = useRef<WebView>(null);

  useEffect(() => {
    (async () => {
      try {
        const [c, p] = await Promise.all([api.city(activeCityId), api.pois(activeCityId)]);
        setCity(c);
        setPois(p.filter((x) => !x.kultur_yolu));
        if (activeCityId === "gaziantep") {
          const ky = await api.kulturYolu(activeCityId);
          setKyPois(ky.sort((a, b) => (a.ky_seq ?? 0) - (b.ky_seq ?? 0)));
        } else {
          setKyPois([]);
          setShowKY(false);
        }
      } catch (e) { console.warn(e); }
    })();
  }, [activeCityId]);

  const html = useMemo(() => {
    if (!city) return "<html><body></body></html>";
    const regular = pois.map((p) => ({
      id: p.id, name: p.name, cat: p.category, lat: p.lat, lng: p.lng, xp: p.xp_reward,
    }));
    const ky = showKY
      ? kyPois.map((p) => ({
          id: p.id, name: p.name, tr: p.name_tr ?? "", lat: p.lat, lng: p.lng,
          seq: p.ky_seq ?? 0, xp: p.xp_reward,
        }))
      : [];
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
  .ky-pin{display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;color:#fff;font-weight:800;font-size:11px;background:#7A1F8F;border:2px solid #fff;box-shadow:0 2px 6px rgba(122,31,143,0.4);}
  .leaflet-popup-content-wrapper{border-radius:14px}
  .leaflet-popup-content{margin:10px 14px;font-size:13px;}
  .pop-title{font-weight:700;color:#1A1816;margin-bottom:2px}
  .pop-tr{font-style:italic;color:#6E6A63;font-size:11px;margin-bottom:4px}
  .pop-meta{color:#6E6A63;font-size:11px}
  .pop-xp{display:inline-block;margin-top:6px;background:#FCE9E1;color:#C85A40;padding:2px 8px;border-radius:999px;font-weight:700;font-size:11px}
  .pop-ky{display:inline-block;margin-top:6px;background:#F3E1F8;color:#7A1F8F;padding:2px 8px;border-radius:999px;font-weight:700;font-size:11px}
</style>
</head><body><div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  const map = L.map('m', { zoomControl: true, attributionControl: false }).setView([${city.lat}, ${city.lng}], 13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  const regular = ${JSON.stringify(regular)};
  const ky = ${JSON.stringify(ky)};
  const catColor = ${JSON.stringify(catColor)};
  const initials = { landmark:'L', museum:'M', historic:'H', 'must-see':'★', restaurant:'F' };
  const markers = [];
  regular.forEach(p => {
    const color = catColor[p.cat] || '#1A1816';
    const icon = L.divIcon({
      className:'', html:'<div class="pin" style="background:'+color+'">'+(initials[p.cat]||'?')+'</div>',
      iconSize:[34,34], iconAnchor:[17,17]
    });
    const m = L.marker([p.lat,p.lng],{icon}).addTo(map)
      .bindPopup('<div class="pop-title">'+p.name+'</div><div class="pop-meta">'+p.cat.toUpperCase()+'</div><div class="pop-xp">+'+p.xp+' XP</div>');
    markers.push(m);
  });
  if (ky.length){
    const sorted = ky.slice().sort((a,b)=>a.seq-b.seq);
    const latlngs = sorted.map(p=>[p.lat,p.lng]);
    L.polyline(latlngs,{ color:'#7A1F8F', weight:3, opacity:0.55, dashArray:'6,4' }).addTo(map);
    sorted.forEach(p => {
      const icon = L.divIcon({ className:'', html:'<div class="ky-pin">'+p.seq+'</div>', iconSize:[26,26], iconAnchor:[13,13] });
      const m = L.marker([p.lat,p.lng],{icon}).addTo(map)
        .bindPopup('<div class="pop-title">'+p.seq+'. '+p.name+'</div>'+(p.tr?'<div class="pop-tr">'+p.tr+'</div>':'')+'<div class="pop-ky">KÜLTÜR YOLU</div> <span class="pop-xp">+'+p.xp+' XP</span>');
      markers.push(m);
    });
  }
  if (markers.length){
    const group = L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.2));
  }
</script></body></html>`;
  }, [city, pois, kyPois, showKY]);

  const isGaz = activeCityId === "gaziantep";

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
          {isGaz && <Legend dot="#7A1F8F" label="Kültür Yolu" />}
        </View>
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
          />
        )}
        {isGaz && (
          <Pressable
            style={[styles.kyToggle, showKY && styles.kyToggleActive]}
            onPress={() => setShowKY((v) => !v)}
            testID="kultur-yolu-toggle"
          >
            <Ionicons name="footsteps" size={16} color={showKY ? "#FFF" : colors.onSurface} />
            <View>
              <Text style={[styles.kyToggleText, showKY && { color: "#FFF" }]}>
                Kültür Yolu {showKY ? "ON" : "OFF"}
              </Text>
              <Text style={[styles.kyToggleSub, showKY && { color: "rgba(255,255,255,0.85)" }]}>
                53 sites · walking route
              </Text>
            </View>
          </Pressable>
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
  mapWrap: { flex: 1, paddingBottom: 78 },
  kyToggle: { position: "absolute", left: spacing.lg, bottom: 78 + spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  kyToggleActive: { backgroundColor: "#7A1F8F", borderColor: "#7A1F8F" },
  kyToggleText: { fontWeight: "700", fontSize: 13, color: colors.onSurface },
  kyToggleSub: { fontSize: 10, color: colors.muted, marginTop: 1 },
});
