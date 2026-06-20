import { useEffect, useState, useCallback } from "react";
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { api, type POI } from "@/src/api";
import { useApp, getDisplayName } from "@/src/store";
import { addPhoto, listPhotos, removePhoto, type PlacePhoto } from "@/src/photos";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

const CATEGORY_LABEL: Record<string, string> = {
  landmark: "Landmark",
  museum: "Museum",
  historic: "Historic Site",
  "must-see": "Must See",
  restaurant: "Restaurant",
};

export default function POIDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { deviceId, refreshProgress } = useApp();
  const [poi, setPoi] = useState<POI | null>(null);
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState<PlacePhoto[]>([]);

  useEffect(() => {
    api.poi(id).then(setPoi).catch(console.warn);
  }, [id]);

  const loadPhotos = useCallback(async () => {
    if (id) setPhotos(await listPhotos(id));
  }, [id]);
  useEffect(() => { loadPhotos(); }, [loadPhotos]);
  useFocusEffect(useCallback(() => { loadPhotos(); }, [loadPhotos]));

  const onAddPhoto = useCallback(async (source: "camera" | "library") => {
    if (!poi) return;
    try {
      let res;
      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Camera permission denied", "Enable camera access in Settings to take photos.");
          return;
        }
        res = await ImagePicker.launchCameraAsync({
          quality: 0.85, allowsEditing: false, base64: Platform.OS === "web",
        });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Library permission denied", "Enable photo access in Settings to attach photos.");
          return;
        }
        res = await ImagePicker.launchImageLibraryAsync({
          quality: 0.85, allowsEditing: false, base64: Platform.OS === "web",
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
        });
      }
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      await addPhoto({
        poi_id: poi.id, poi_name: poi.name,
        sourceUri: asset.uri, base64: asset.base64 ?? null,
      });
      await loadPhotos();
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    } catch (e: any) {
      Alert.alert("Couldn't add photo", e?.message ?? "Please try again.");
    }
  }, [poi, loadPhotos]);

  const onChoosePhotoSource = useCallback(() => {
    if (!poi) return;
    if (Platform.OS === "web") {
      onAddPhoto("library");
      return;
    }
    Alert.alert(`Add a photo of ${poi.name}`, "Pick a source:", [
      { text: "Take photo", onPress: () => onAddPhoto("camera") },
      { text: "Choose from library", onPress: () => onAddPhoto("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [poi, onAddPhoto]);

  const onMakePostcard = useCallback((photo: PlacePhoto) => {
    router.push({
      pathname: "/collage",
      params: {
        photo: photo.uri,
        poi_name: photo.poi_name,
        photo_id: photo.id,
      },
    });
  }, [router]);

  const onDeletePhoto = useCallback((p: PlacePhoto) => {
    Alert.alert("Delete photo?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await removePhoto(p.id); await loadPhotos(); } },
    ]);
  }, [loadPhotos]);

  const [locPerm, setLocPerm] = useState<{ status: Location.PermissionStatus; canAskAgain: boolean } | null>(null);

  // Probe location permission on mount + each focus so the check-in button can reflect the current state.
  const refreshLocPerm = useCallback(async () => {
    try {
      const r = await Location.getForegroundPermissionsAsync();
      setLocPerm({ status: r.status, canAskAgain: r.canAskAgain });
    } catch { /* unsupported (e.g. web with no API) */ }
  }, []);
  useEffect(() => { refreshLocPerm(); }, [refreshLocPerm]);
  useFocusEffect(useCallback(() => { refreshLocPerm(); }, [refreshLocPerm]));

  const handleCheckIn = async () => {
    if (!poi) return;
    // STEP 1: Ensure location permission is granted. Check-in REQUIRES GPS.
    let perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== "granted") {
      if (perm.canAskAgain) {
        // Show a brief pre-permission explanation, then trigger the native prompt.
        const proceed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            "Enable GPS to check in",
            `CityQuest verifies you're within 150 m of ${poi.name} using your device's location. Your coordinates are only sent to confirm check-ins — never shared with other users.`,
            [
              { text: "Not now", style: "cancel", onPress: () => resolve(false) },
              { text: "Enable", onPress: () => resolve(true) },
            ],
          );
        });
        if (!proceed) return;
        const r = await Location.requestForegroundPermissionsAsync();
        setLocPerm({ status: r.status, canAskAgain: r.canAskAgain });
        if (r.status !== "granted") {
          // User just denied — politely stop. If they tap the button again with canAskAgain still true, we'll ask once more.
          return;
        }
        perm = r;
      } else {
        // Permanently denied. Send them to Settings (don't dead-end).
        Alert.alert(
          "Location is off",
          `Check-ins require GPS so we can verify you're within 150 m of ${poi.name}. Open Settings to allow location access for CityQuest.`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }
    }

    setBusy(true);
    try {
      // STEP 2: Read coordinates with a strict timeout — refuse the call if we can't.
      let coords: { lat: number; lng: number } | null = null;
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      } catch (e) { console.warn("loc", e); }

      if (!coords) {
        Alert.alert(
          "Couldn't read your location",
          "We need a clear GPS fix to verify the 150 m radius. Step outside or near a window and try again.",
          [{ text: "OK" }],
        );
        return;
      }

      // STEP 3: Backend re-verifies the 150 m radius and rejects anything outside.
      const name = await getDisplayName();
      const r = await api.poiCheckIn({
        device_id: deviceId, poi_id: poi.id,
        lat: coords.lat, lng: coords.lng,
        display_name: name,
      });
      if (r.too_far) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Too far away", r.message, [{ text: "Got it" }]);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refreshProgress();
      const credited = r.quests_credited?.length ?? 0;
      Alert.alert(
        credited > 0 ? "Checked in!" : "Visit recorded",
        r.message + (credited > 0 ? "\n\nOpen the Quest tab to keep going." : ""),
        credited > 0
          ? [
              { text: "Stay here", style: "cancel" },
              { text: "Go to Quests", onPress: () => router.replace("/(tabs)/quest") },
            ]
          : [{ text: "Done" }],
      );
    } catch (e) { console.warn(e); Alert.alert("Couldn't check in", "Please try again."); }
    finally { setBusy(false); }
  };

  if (!poi) return <View style={{ flex: 1, backgroundColor: colors.surface }} />;

  const isFood = poi.category === "restaurant";
  const directionsUrl = `https://www.google.com/maps?q=${poi.lat},${poi.lng}`;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="poi-detail">
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.hero}>
          <Image source={poi.image} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={["rgba(28,26,23,0.1)", "rgba(28,26,23,0.85)"]} style={StyleSheet.absoluteFill} />
          <Pressable onPress={() => router.back()} style={styles.backBtn} testID="poi-back">
            <Ionicons name="chevron-back" size={22} color="#FFF" />
          </Pressable>
          <View style={styles.heroBody}>
            <View style={styles.kickerRow}>
              <Text style={styles.kicker}>{CATEGORY_LABEL[poi.category] ?? poi.category.toUpperCase()}</Text>
              {poi.kultur_yolu && (
                <View style={styles.kyPill}>
                  <Ionicons name="footsteps" size={10} color="#FFF" />
                  <Text style={styles.kyPillText}>KÜLTÜR YOLU · #{poi.ky_seq}</Text>
                </View>
              )}
            </View>
            <Text style={styles.title}>{poi.name}</Text>
            {poi.name_tr && poi.name_tr !== poi.name && (
              <Text style={styles.subtitleTR}>{poi.name_tr}</Text>
            )}
            <View style={styles.metaRow}>
              <View style={styles.meta}>
                <Ionicons name="star" size={12} color={colors.brandSecondary} />
                <Text style={styles.metaText}>{poi.rating.toFixed(1)}</Text>
              </View>
              <View style={styles.meta}>
                <Ionicons name="flash" size={12} color="#FFF" />
                <Text style={styles.metaText}>+{poi.xp_reward} XP</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.sectionLabel}>ABOUT</Text>
          <Text style={styles.desc}>{poi.description}</Text>

          <View style={styles.actions}>
            <Pressable
              style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
              onPress={handleCheckIn}
              disabled={busy}
              testID="poi-checkin"
            >
              <Ionicons
                name={locPerm?.status === "granted" ? "location" : "location-outline"}
                size={16}
                color="#FFF"
              />
              <Text style={styles.primaryBtnText}>
                {busy
                  ? "Checking in..."
                  : locPerm?.status === "granted"
                    ? "Check in here"
                    : "Enable GPS to check in"}
              </Text>
            </Pressable>
            {locPerm && locPerm.status !== "granted" && (
              <Pressable
                style={styles.gpsHint}
                onPress={() => {
                  if (locPerm.canAskAgain) {
                    handleCheckIn();
                  } else {
                    Linking.openSettings();
                  }
                }}
                testID="poi-gps-hint"
              >
                <Ionicons name="alert-circle" size={13} color={colors.brand} />
                <Text style={styles.gpsHintText}>
                  {locPerm.canAskAgain
                    ? "Tap to allow location — required to check in"
                    : "Location is off. Open Settings → allow location for CityQuest"}
                </Text>
                <Ionicons name="chevron-forward" size={13} color={colors.brand} />
              </Pressable>
            )}
            <View style={styles.actionsRow}>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => Linking.openURL(directionsUrl)}
                testID="poi-directions"
              >
                <Ionicons name="navigate" size={14} color={colors.brand} />
                <Text style={styles.secondaryBtnText}>Directions</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(poi.name)}`)}
                testID="poi-search"
              >
                <Ionicons name="search" size={14} color={colors.brand} />
                <Text style={styles.secondaryBtnText}>Learn more</Text>
              </Pressable>
            </View>
            <Text style={styles.checkInHint}>
              <Ionicons name="information-circle-outline" size={11} color={colors.muted} />
              {`  GPS check-in within 150 m. Auto-credits every quest that includes this place.`}
            </Text>
          </View>

          <ComingSoon icon="time-outline" title="Opening hours" subtitle="Daily schedule + holiday closures arriving soon." />

          {/* Location & access — populated from canonical dataset when available */}
          <LocationCard poi={poi} />

          {/* My Photos — user-attached photos for this place */}
          <PhotosSection
            photos={photos}
            onAdd={onChoosePhotoSource}
            onMakePostcard={onMakePostcard}
            onDelete={onDeletePhoto}
          />

          {isFood ? (
            <ComingSoon icon="restaurant-outline" title="Menu highlights" subtitle="Signature dishes and price range — coming soon." />
          ) : (
            <ComingSoon icon="book-outline" title="Visitor tips" subtitle="Best time to visit, accessibility, photography rules — coming soon." />
          )}

          <View style={styles.coordCard}>
            <Ionicons name="pin" size={14} color={colors.muted} />
            <Text style={styles.coordText}>{poi.lat.toFixed(5)}, {poi.lng.toFixed(5)}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function LocationCard({ poi }: { poi: POI }) {
  const md = (poi.metadata ?? {}) as { address?: string | null; plus_code?: string | null };
  const address = md.address;
  const plusCode = md.plus_code;

  // Always-available "Open in Maps" link using the POI coordinates.
  const mapsUrl =
    Platform.OS === "ios"
      ? `https://maps.apple.com/?q=${encodeURIComponent(poi.name)}&ll=${poi.lat},${poi.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${poi.lat},${poi.lng}&query_place_id=${encodeURIComponent(poi.name)}`;

  if (!address && !plusCode) {
    return (
      <ComingSoon
        icon="location-outline"
        title="Location & access"
        subtitle="Address, nearest transit, entry fee — coming soon."
      />
    );
  }

  return (
    <View style={styles.locCard} testID="poi-location-card">
      <View style={styles.locHead}>
        <View style={styles.csIcon}>
          <Ionicons name="location" size={16} color={colors.brand} />
        </View>
        <Text style={styles.locTitle}>Location & access</Text>
      </View>
      {!!address && (
        <View style={styles.locRow}>
          <Ionicons name="navigate-outline" size={14} color={colors.muted} style={{ marginTop: 2 }} />
          <Text style={styles.locText}>{address}</Text>
        </View>
      )}
      {!!plusCode && (
        <View style={styles.locRow}>
          <Ionicons name="grid-outline" size={14} color={colors.muted} style={{ marginTop: 2 }} />
          <Text style={[styles.locText, styles.locMono]}>{plusCode}</Text>
        </View>
      )}
      <Pressable
        onPress={() => Linking.openURL(mapsUrl)}
        style={styles.locBtn}
        testID="open-in-maps"
      >
        <Ionicons name="map" size={14} color={colors.surface} />
        <Text style={styles.locBtnText}>Open in Maps</Text>
      </Pressable>
    </View>
  );
}


function PhotosSection({
  photos, onAdd, onMakePostcard, onDelete,
}: {
  photos: PlacePhoto[];
  onAdd: () => void;
  onMakePostcard: (p: PlacePhoto) => void;
  onDelete: (p: PlacePhoto) => void;
}) {
  return (
    <View style={styles.photosCard} testID="poi-photos-section">
      <View style={styles.photosHead}>
        <View style={styles.csIcon}>
          <Ionicons name="camera" size={16} color={colors.brand} />
        </View>
        <Text style={styles.photosTitle}>Your photos</Text>
        <Pressable onPress={onAdd} style={styles.photosAddBtn} testID="add-photo-btn">
          <Ionicons name="add" size={14} color={colors.surface} />
          <Text style={styles.photosAddText}>Add photo</Text>
        </Pressable>
      </View>
      {photos.length === 0 ? (
        <Text style={styles.photosEmpty}>
          Snap a photo to remember this place — turn it into a postcard later!
        </Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingTop: 4 }}
        >
          {photos.map((p) => (
            <View key={p.id} style={styles.photoCell} testID={`photo-${p.id}`}>
              <Image source={p.uri} style={styles.photoImg} contentFit="cover" />
              <View style={styles.photoOverlay}>
                <Pressable
                  onPress={() => onMakePostcard(p)}
                  style={[styles.photoAction, styles.photoActionPrimary]}
                  testID={`postcard-from-photo-${p.id}`}
                >
                  <Ionicons name="share-social" size={11} color={colors.surface} />
                  <Text style={styles.photoActionText}>Postcard</Text>
                </Pressable>
                <Pressable
                  hitSlop={8}
                  onPress={() => onDelete(p)}
                  style={styles.photoDeleteBtn}
                  testID={`delete-photo-${p.id}`}
                >
                  <Ionicons name="trash" size={12} color="#fff" />
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function ComingSoon({ icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <View style={styles.csCard}>
      <View style={styles.csIcon}>
        <Ionicons name={icon} size={18} color={colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.csTitle}>{title}</Text>
        <Text style={styles.csSub}>{subtitle}</Text>
      </View>
      <Text style={styles.csTag}>SOON</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { height: 320 },
  backBtn: { position: "absolute", top: spacing.xxxl + spacing.xs, left: spacing.lg, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  heroBody: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg },
  kickerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm, flexWrap: "wrap" },
  kicker: { color: colors.brandSecondary, fontSize: 11, letterSpacing: 2.5, fontWeight: "800" },
  kyPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#7A1F8F", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  kyPillText: { color: "#FFF", fontSize: 9, letterSpacing: 1, fontWeight: "800" },
  title: { fontFamily: fonts.display, color: "#FFF", fontSize: 30, letterSpacing: -0.3 },
  subtitleTR: { color: "rgba(255,255,255,0.92)", fontStyle: "italic", fontSize: 13, marginTop: 2 },
  metaRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  meta: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.4)", paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  metaText: { color: "#FFF", fontSize: 11, fontWeight: "700" },

  body: { padding: spacing.lg },
  sectionLabel: { fontSize: 11, letterSpacing: 2, color: colors.brand, fontWeight: "700", marginBottom: spacing.sm },
  desc: { color: colors.onSurfaceTertiary, fontSize: 14, lineHeight: 21 },

  actions: { marginTop: spacing.xl, gap: spacing.sm },
  actionsRow: { flexDirection: "row", gap: spacing.sm },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.pill, ...shadow.pill },
  primaryBtnText: { color: "#FFF", fontWeight: "800", fontSize: 14, letterSpacing: 0.3 },
  secondaryBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brand, backgroundColor: "#FCE9E1" },
  secondaryBtnText: { color: colors.brand, fontWeight: "700", fontSize: 12 },
  checkInHint: { color: colors.muted, fontSize: 11, marginTop: 4, textAlign: "center", lineHeight: 16 },
  gpsHint: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FCE9E1",
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#F5C7B4",
  },
  gpsHintText: { flex: 1, fontSize: 11.5, color: colors.brand, fontWeight: "600" },

  csCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.lg, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  csIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#FCE9E1", alignItems: "center", justifyContent: "center" },
  csTitle: { fontWeight: "700", fontSize: 14, color: colors.onSurface },
  csSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  csTag: { fontSize: 9, letterSpacing: 1.5, color: colors.brand, fontWeight: "800", backgroundColor: "#FCE9E1", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },

  coordCard: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.lg, alignSelf: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill },
  coordText: { color: colors.muted, fontSize: 12, fontWeight: "600", letterSpacing: 0.3 },

  // Location & access card (when metadata.address / metadata.plus_code present)
  locCard: { marginTop: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  locHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  locTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.onSurface, flex: 1 },
  locRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 8 },
  locText: { flex: 1, fontSize: 13.5, color: colors.onSurface, lineHeight: 19 },
  locMono: { fontVariant: ["tabular-nums"], color: colors.muted, fontSize: 12, letterSpacing: 0.3 },
  locBtn: { marginTop: 4, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.brand, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.pill, alignSelf: "flex-start" },
  locBtnText: { color: colors.surface, fontWeight: "700", fontSize: 13, letterSpacing: 0.3 },

  // Photos section
  photosCard: { marginTop: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  photosHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.sm },
  photosTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.onSurface, flex: 1 },
  photosAddBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brand, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill },
  photosAddText: { color: colors.surface, fontWeight: "700", fontSize: 11, letterSpacing: 0.3 },
  photosEmpty: { color: colors.muted, fontSize: 12.5, lineHeight: 18, paddingVertical: spacing.sm },
  photoCell: { position: "relative", width: 120, height: 150, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surfaceTertiary },
  photoImg: { width: "100%", height: "100%" },
  photoOverlay: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 6, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 },
  photoAction: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.pill },
  photoActionPrimary: { backgroundColor: colors.brand },
  photoActionText: { color: colors.surface, fontWeight: "700", fontSize: 10, letterSpacing: 0.2 },
  photoDeleteBtn: { backgroundColor: "rgba(0,0,0,0.55)", width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
});
