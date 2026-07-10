import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text,
  TextInput, View, KeyboardAvoidingView,
} from "react-native";
import { Image } from "expo-image";
import { Image as RNImage } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import * as Haptics from "expo-haptics";
import ViewShot from "react-native-view-shot";
import { api, type City, type Progress } from "@/src/api";
import { useApp, getAvatarUri } from "@/src/store";
import { addPostcard, type Postcard } from "@/src/postcards";
import MyPlacesPhotoPicker from "@/src/components/MyPlacesPhotoPicker";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

type Frame = "postcard" | "polaroid" | "magazine" | "xp";

const FRAMES: { id: Frame; label: string }[] = [
  { id: "postcard", label: "Postcard" },
  { id: "polaroid", label: "Polaroid" },
  { id: "magazine", label: "Magazine" },
  { id: "xp",       label: "XP Card"  },
];

const MAX_PHOTOS = 6;

export default function CollageScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ photo?: string; poi_name?: string }>();
  const { activeCityId, deviceId } = useApp();
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [frame, setFrame] = useState<Frame>("postcard");
  const [caption, setCaption] = useState("");
  const [city, setCity] = useState<City | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const shotRef = useRef<ViewShot>(null);

  // Set of POI ids the user has actually checked in to — this is what the
  // "From places you've visited" picker filters against so a user can't
  // accidentally see (or delete) photos of places they never visited.
  const visitedPoiIds = useMemo(() => {
    const s = new Set<string>();
    (progress?.check_ins || []).forEach((ci) => { if (ci.poi_id) s.add(ci.poi_id); });
    return s;
  }, [progress]);

  // Preload photo + caption when launched from a POI's "Make postcard" action.
  useEffect(() => {
    if (typeof params.photo === "string" && params.photo) {
      setPhotoUris([params.photo]);
    }
    if (typeof params.poi_name === "string" && params.poi_name && !caption) {
      setCaption(params.poi_name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.city(activeCityId).then(setCity).catch(console.warn);
    if (deviceId) api.progress(deviceId).then(setProgress).catch(console.warn);
    getAvatarUri().then(setAvatarUri).catch(console.warn);
  }, [activeCityId, deviceId]);

  // ----- permission helpers -----

  const ensureMediaLibrary = async (): Promise<boolean> => {
    const { status, canAskAgain } = await MediaLibrary.getPermissionsAsync();
    if (status === "granted") return true;
    if (canAskAgain) {
      const res = await MediaLibrary.requestPermissionsAsync();
      if (res.status === "granted") return true;
    }
    Alert.alert(
      "Permission needed",
      "Please grant photo library access to save your postcards.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openSettings() },
      ],
    );
    return false;
  };

  // ----- photo picking -----

  const remaining = () => Math.max(0, MAX_PHOTOS - photoUris.length);

  // Camera capture removed per product change: postcard photos now come
  // strictly from "My places" (POI check-in photos) or from the device
  // gallery. Users who still want to shoot a fresh photo can do so via
  // the POI detail screen's "Add photo" button and then reuse it here.

  const pickFromLibrary = async () => {
    if (remaining() === 0) {
      Alert.alert("Max reached", `You can add up to ${MAX_PHOTOS} photos. Remove one to add a new shot.`);
      return;
    }
    const { status, canAskAgain } = await ImagePicker.getMediaLibraryPermissionsAsync();
    let ok = status === "granted";
    if (!ok && canAskAgain) {
      const r = await ImagePicker.requestMediaLibraryPermissionsAsync();
      ok = r.status === "granted";
    }
    if (!ok) {
      Alert.alert("Photo access disabled", "Enable photo library access to pick travel pictures.", [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    const left = remaining();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: left > 1,
      selectionLimit: left,
      quality: 0.85,
    });
    if (!result.canceled && result.assets?.length) {
      const added = result.assets.map((a) => a.uri).slice(0, left);
      setPhotoUris((prev) => [...prev, ...added].slice(0, MAX_PHOTOS));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const removePhoto = (idx: number) => {
    setPhotoUris((prev) => prev.filter((_, i) => i !== idx));
    Haptics.selectionAsync();
  };

  const clearAll = () => {
    setPhotoUris([]);
    setCaption("");
  };

  // ----- capture + save + share -----

  const capture = async (): Promise<string | null> => {
    if (!shotRef.current?.capture) return null;
    try {
      const uri = await shotRef.current.capture();
      return uri;
    } catch (e) { console.warn(e); return null; }
  };

  const persistPostcard = async (uri: string) => {
    const card: Postcard = {
      id: `pc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      uri,
      frame,
      city: city?.name ?? "City",
      city_id: activeCityId,
      caption: caption.trim(),
      created_at: new Date().toISOString(),
    };
    await addPostcard(card);
  };

  const saveToGallery = async () => {
    if (photoUris.length === 0) return;
    setBusy(true);
    try {
      const ok = await ensureMediaLibrary();
      const uri = await capture();
      if (!uri) throw new Error("capture failed");
      if (ok) {
        await MediaLibrary.saveToLibraryAsync(uri);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      await persistPostcard(uri);
      Alert.alert("Saved!", ok ? "Postcard added to your gallery and Profile." : "Postcard saved to your Profile.", [
        { text: "View on profile", onPress: () => router.replace("/(tabs)/profile") },
        { text: "Done", style: "cancel" },
      ]);
    } catch (e) { console.warn(e); Alert.alert("Save failed", "Please try again."); }
    finally { setBusy(false); }
  };

  const share = async () => {
    if (photoUris.length === 0) return;
    setBusy(true);
    try {
      const uri = await capture();
      if (!uri) throw new Error("capture failed");
      await persistPostcard(uri);
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert("Sharing unavailable", "Your device doesn't support the share sheet.");
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        dialogTitle: `CityQuest · ${city?.name ?? "Travel"} postcard`,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) { console.warn(e); Alert.alert("Share failed", "Please try again."); }
    finally { setBusy(false); }
  };

  // ----- render -----

  const hasPhotos = photoUris.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceInverse }} testID="collage-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="collage-back">
            <Ionicons name="close" size={22} color="#FFF" />
          </Pressable>
          <Text style={styles.title}>Postcard Maker</Text>
          <View style={styles.iconBtn} />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }} keyboardShouldPersistTaps="handled">
          <View style={styles.canvasWrap}>
            <ViewShot
              ref={shotRef}
              options={{ format: "png", quality: 0.95, result: "tmpfile" }}
              style={styles.canvasShadow}
            >
              <PostcardCanvas
                photoUris={photoUris}
                frame={frame}
                cityName={city?.name ?? "Your City"}
                country={city?.country ?? ""}
                caption={caption}
                xp={progress?.xp ?? 0}
                level={progress?.title ?? "Newcomer"}
                quests={progress?.completed_quests?.length ?? 0}
                avatarUri={avatarUri}
              />
            </ViewShot>
          </View>

          {/* Photo strip (selected) + Add buttons */}
          <View style={styles.stripBlock} testID="photo-strip">
            <View style={styles.stripHeader}>
              <Text style={styles.kicker}>
                {hasPhotos ? `PHOTOS · ${photoUris.length} / ${MAX_PHOTOS}` : "STEP 1 — ADD PHOTOS (UP TO 6)"}
              </Text>
              {hasPhotos && (
                <Pressable hitSlop={10} onPress={clearAll} testID="strip-clear">
                  <Text style={styles.stripClear}>Clear all</Text>
                </Pressable>
              )}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.stripRow}
            >
              {photoUris.map((u, i) => (
                <View key={`${u}_${i}`} style={styles.stripThumbWrap}>
                  <Image source={u} style={styles.stripThumb} contentFit="cover" />
                  <Pressable
                    onPress={() => removePhoto(i)}
                    style={styles.stripRemove}
                    hitSlop={8}
                    testID={`strip-remove-${i}`}
                  >
                    <Ionicons name="close" size={14} color="#FFF" />
                  </Pressable>
                  <View style={styles.stripIndex}>
                    <Text style={styles.stripIndexText}>{i + 1}</Text>
                  </View>
                </View>
              ))}
              {remaining() > 0 && (
                <>
                  <Pressable
                    onPress={() => setPickerOpen(true)}
                    style={[styles.stripAddTile, styles.stripAddTileAlt]}
                    testID="strip-add-my-places"
                  >
                    <Ionicons name="location" size={22} color={colors.brand} />
                    <Text style={[styles.stripAddText, { color: colors.brand }]}>My places</Text>
                    <Text style={[styles.stripAddHint, { color: colors.brand, opacity: 0.7 }]}>from check-ins</Text>
                  </Pressable>
                  <Pressable
                    onPress={pickFromLibrary}
                    style={styles.stripAddTile}
                    testID="strip-add-library"
                  >
                    <Ionicons name="images" size={22} color="#FFF" />
                    <Text style={styles.stripAddText}>From library</Text>
                    <Text style={styles.stripAddHint}>up to {remaining()} more</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>

          {hasPhotos && (
            <>
              <Text style={[styles.kicker, { paddingHorizontal: spacing.lg, marginTop: spacing.xl }]}>STEP 2 — CHOOSE FRAME</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.frameRow}
                testID="frame-row"
              >
                {FRAMES.map((f) => {
                  const active = frame === f.id;
                  return (
                    <Pressable
                      key={f.id}
                      onPress={() => { setFrame(f.id); Haptics.selectionAsync(); }}
                      style={[styles.frameChip, active && styles.frameChipActive]}
                      testID={`frame-chip-${f.id}`}
                    >
                      <Text style={[styles.frameChipText, active && { color: "#FFF" }]}>{f.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={styles.captionBlock}>
                <Text style={styles.kicker}>STEP 3 — ADD CAPTION</Text>
                <TextInput
                  style={styles.captionInput}
                  placeholder="e.g. The Gypsy Girl in person..."
                  placeholderTextColor="#888"
                  value={caption}
                  onChangeText={setCaption}
                  maxLength={80}
                  testID="caption-input"
                />
                <Text style={styles.captionCount}>{caption.length}/80</Text>
              </View>

              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.actionBtn, styles.actionAlt, busy && { opacity: 0.5 }]}
                  onPress={clearAll}
                  disabled={busy}
                  testID="collage-replace"
                >
                  <Ionicons name="refresh" size={18} color="#FFF" />
                  <Text style={styles.actionText}>Reset</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, styles.actionSave, busy && { opacity: 0.5 }]}
                  onPress={saveToGallery}
                  disabled={busy}
                  testID="collage-save"
                >
                  <Ionicons name="download" size={18} color="#FFF" />
                  <Text style={styles.actionText}>Save</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, styles.actionShare, busy && { opacity: 0.5 }]}
                  onPress={share}
                  disabled={busy}
                  testID="collage-share"
                >
                  <Ionicons name="share-social" size={18} color="#FFF" />
                  <Text style={styles.actionText}>Share</Text>
                </Pressable>
              </View>

              <View style={styles.socialHints}>
                <Text style={styles.socialHintsTitle}>Share to:</Text>
                <View style={styles.socialIcons}>
                  <SocialBadge icon="logo-instagram" label="Instagram" />
                  <SocialBadge icon="logo-tiktok" label="TikTok" />
                  <SocialBadge icon="logo-twitter" label="X" />
                  <SocialBadge icon="logo-whatsapp" label="WhatsApp" />
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <MyPlacesPhotoPicker
        visible={pickerOpen}
        max={remaining()}
        visitedPoiIds={visitedPoiIds}
        onCancel={() => setPickerOpen(false)}
        onConfirm={(uris) => {
          setPickerOpen(false);
          if (uris.length > 0) {
            setPhotoUris((prev) => [...prev, ...uris].slice(0, MAX_PHOTOS));
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
        }}
      />
    </View>
  );
}

function SocialBadge({ icon, label }: { icon: any; label: string }) {
  return (
    <View style={styles.socialBadge}>
      <Ionicons name={icon} size={18} color="#FFF" />
      <Text style={styles.socialBadgeText}>{label}</Text>
    </View>
  );
}

// =================== POSTCARD CANVAS ===================

type CanvasProps = {
  photoUris: string[];
  frame: Frame;
  cityName: string;
  country: string;
  caption: string;
  xp: number;
  level: string;
  quests: number;
  avatarUri: string | null;
};

function PostcardCanvas(p: CanvasProps) {
  return (
    <View style={{ width: 320, height: 400 }} collapsable={false}>
      {p.frame === "postcard"  && <PostcardFrame {...p} />}
      {p.frame === "polaroid"  && <PolaroidFrame {...p} />}
      {p.frame === "magazine"  && <MagazineFrame {...p} />}
      {p.frame === "xp"        && <XPFrame {...p} />}
    </View>
  );
}

/**
 * Adaptive photo montage that lays out 1-6 photos in a balanced grid.
 *  1 → full bleed
 *  2 → side-by-side
 *  3 → one big + two stacked
 *  4 → 2×2 grid
 *  5 → one big + 2×2 grid
 *  6 → 3×2 grid
 */
function PhotoMontage({ uris, gap = 4 }: { uris: string[]; gap?: number }) {
  if (uris.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#2A2722" }}>
        <Ionicons name="image-outline" size={48} color="#666" />
        <Text style={{ color: "#888", marginTop: 8 }}>Add photos to preview</Text>
      </View>
    );
  }
  const Img = ({ uri, style }: { uri: string; style?: any }) => (
    <View style={[{ overflow: "hidden", backgroundColor: "#1A1816" }, style]}>
      <RNImage source={{ uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
    </View>
  );

  if (uris.length === 1) {
    return <Img uri={uris[0]} style={{ flex: 1 }} />;
  }
  if (uris.length === 2) {
    return (
      <View style={{ flex: 1, flexDirection: "row", gap }}>
        <Img uri={uris[0]} style={{ flex: 1 }} />
        <Img uri={uris[1]} style={{ flex: 1 }} />
      </View>
    );
  }
  if (uris.length === 3) {
    return (
      <View style={{ flex: 1, flexDirection: "row", gap }}>
        <Img uri={uris[0]} style={{ flex: 1.4 }} />
        <View style={{ flex: 1, gap }}>
          <Img uri={uris[1]} style={{ flex: 1 }} />
          <Img uri={uris[2]} style={{ flex: 1 }} />
        </View>
      </View>
    );
  }
  if (uris.length === 4) {
    return (
      <View style={{ flex: 1, gap }}>
        <View style={{ flex: 1, flexDirection: "row", gap }}>
          <Img uri={uris[0]} style={{ flex: 1 }} />
          <Img uri={uris[1]} style={{ flex: 1 }} />
        </View>
        <View style={{ flex: 1, flexDirection: "row", gap }}>
          <Img uri={uris[2]} style={{ flex: 1 }} />
          <Img uri={uris[3]} style={{ flex: 1 }} />
        </View>
      </View>
    );
  }
  if (uris.length === 5) {
    return (
      <View style={{ flex: 1, flexDirection: "row", gap }}>
        <Img uri={uris[0]} style={{ flex: 1.3 }} />
        <View style={{ flex: 1, gap }}>
          <View style={{ flex: 1, flexDirection: "row", gap }}>
            <Img uri={uris[1]} style={{ flex: 1 }} />
            <Img uri={uris[2]} style={{ flex: 1 }} />
          </View>
          <View style={{ flex: 1, flexDirection: "row", gap }}>
            <Img uri={uris[3]} style={{ flex: 1 }} />
            <Img uri={uris[4]} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
    );
  }
  // 6
  return (
    <View style={{ flex: 1, gap }}>
      <View style={{ flex: 1, flexDirection: "row", gap }}>
        <Img uri={uris[0]} style={{ flex: 1 }} />
        <Img uri={uris[1]} style={{ flex: 1 }} />
        <Img uri={uris[2]} style={{ flex: 1 }} />
      </View>
      <View style={{ flex: 1, flexDirection: "row", gap }}>
        <Img uri={uris[3]} style={{ flex: 1 }} />
        <Img uri={uris[4]} style={{ flex: 1 }} />
        <Img uri={uris[5]} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

function PostcardFrame(p: CanvasProps) {
  return (
    <View style={{ flex: 1, backgroundColor: "#F5EFE3", padding: 14 }}>
      <View style={{ flex: 1, overflow: "hidden", borderRadius: 4 }}>
        <PhotoMontage uris={p.photoUris} />
      </View>
      <View style={{ position: "absolute", top: 14, left: 14, right: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ backgroundColor: "rgba(28,26,23,0.85)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4 }}>
          <Text style={{ color: "#F5EFE3", fontFamily: fonts.display, fontSize: 11, letterSpacing: 2 }}>GREETINGS FROM</Text>
          <Text style={{ color: "#F5EFE3", fontFamily: fonts.display, fontSize: 18 }}>{p.cityName.toUpperCase()}</Text>
        </View>
        <View style={{ width: 48, height: 48, borderRadius: 4, borderWidth: 2, borderColor: "#C85A40", backgroundColor: "rgba(245,239,227,0.92)", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#C85A40", fontFamily: fonts.display, fontWeight: "800", fontSize: 9, letterSpacing: 1 }}>CITY</Text>
          <Text style={{ color: "#C85A40", fontFamily: fonts.display, fontWeight: "800", fontSize: 9, letterSpacing: 1 }}>QUEST</Text>
        </View>
      </View>
      {!!p.caption && (
        <View style={{ position: "absolute", bottom: 28, left: 24, right: 24 }}>
          <Text style={{ color: "#F5EFE3", fontFamily: fonts.display, fontSize: 16, fontStyle: "italic", textShadowColor: "rgba(0,0,0,0.7)", textShadowRadius: 4 }} numberOfLines={2}>{`"${p.caption}"`}</Text>
        </View>
      )}
      <Text style={{ position: "absolute", bottom: 14, right: 14, color: "#1A1816", fontSize: 9, letterSpacing: 1, fontWeight: "700" }}>{p.country.toUpperCase()}</Text>
    </View>
  );
}

function PolaroidFrame(p: CanvasProps) {
  return (
    <View style={{ flex: 1, backgroundColor: "#FFF", paddingTop: 16, paddingHorizontal: 16, paddingBottom: 60, transform: [{ rotate: "-1.5deg" }], ...shadow.card }}>
      <View style={{ flex: 1, overflow: "hidden", backgroundColor: "#000" }}>
        <PhotoMontage uris={p.photoUris} gap={3} />
      </View>
      <View style={{ position: "absolute", bottom: 12, left: 0, right: 0, alignItems: "center", paddingHorizontal: 16 }}>
        <Text style={{ fontFamily: Platform.select({ ios: "Snell Roundhand", android: "cursive", default: "serif" }), fontSize: 18, color: "#1A1816", textAlign: "center" }} numberOfLines={1}>
          {p.caption || `${p.cityName} ★`}
        </Text>
        <Text style={{ color: "#6E6A63", fontSize: 9, letterSpacing: 2, marginTop: 2 }}>CITYQUEST · {p.cityName.toUpperCase()}</Text>
      </View>
    </View>
  );
}

function MagazineFrame(p: CanvasProps) {
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <PhotoMontage uris={p.photoUris} gap={2} />
      <LinearGradient
        colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.85)"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={{ position: "absolute", top: 16, left: 16, right: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Text style={{ color: "#C85A40", fontFamily: fonts.display, fontSize: 11, letterSpacing: 4, fontWeight: "800" }}>CITYQUEST</Text>
        <Text style={{ color: "#FFF", fontSize: 9, letterSpacing: 2, fontWeight: "700" }}>ISSUE 01</Text>
      </View>
      <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 18 }}>
        <View style={{ width: 36, height: 3, backgroundColor: "#C85A40", marginBottom: 10 }} />
        <Text style={{ color: "#FFF", fontFamily: fonts.display, fontSize: 32, lineHeight: 36, letterSpacing: -0.5 }} numberOfLines={2}>{p.cityName}</Text>
        {!!p.caption && <Text style={{ color: "rgba(255,255,255,0.92)", fontSize: 13, lineHeight: 17, marginTop: 6, fontStyle: "italic" }} numberOfLines={2}>{p.caption}</Text>}
        <Text style={{ color: "#D9953A", fontSize: 10, letterSpacing: 2, marginTop: 10, fontWeight: "700" }}>{p.country.toUpperCase()} · TRAVEL EDITION</Text>
      </View>
    </View>
  );
}

function XPFrame(p: CanvasProps) {
  return (
    <View style={{ flex: 1, backgroundColor: "#1A1816" }}>
      <View style={{ flex: 1 }}>
        <PhotoMontage uris={p.photoUris} gap={2} />
        <LinearGradient
          colors={["rgba(0,0,0,0.05)", "rgba(28,26,23,0.95)"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={{ position: "absolute", top: 14, left: 14, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(200,90,64,0.95)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}>
          <Ionicons name="flash" size={11} color="#FFF" />
          <Text style={{ color: "#FFF", fontWeight: "800", fontSize: 11, letterSpacing: 0.5 }}>+{p.xp} XP</Text>
        </View>
        <View style={{ position: "absolute", top: 14, right: 14, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" }}>
          <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 10, letterSpacing: 1 }}>{p.level.toUpperCase()}</Text>
        </View>
      </View>
      <View style={{ padding: 16, paddingTop: 12, borderTopWidth: 2, borderTopColor: "#C85A40", flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: "#C85A40", overflow: "hidden", backgroundColor: "#2A2722", alignItems: "center", justifyContent: "center" }}>
          {p.avatarUri ? (
            <Image source={p.avatarUri} style={{ width: "100%", height: "100%" }} contentFit="cover" />
          ) : (
            <Ionicons name="person" size={28} color="#6E6A63" />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#FFF", fontFamily: fonts.display, fontSize: 20 }} numberOfLines={1}>{p.cityName} · explored</Text>
          {!!p.caption && <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2, fontStyle: "italic" }} numberOfLines={2}>{p.caption}</Text>}
          <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
            <Stat icon="checkmark-circle" label="QUESTS" value={`${p.quests}`} />
            <Stat icon="flash" label="TOTAL XP" value={`${p.xp}`} />
            <Stat icon="ribbon" label="TIER" value={p.level.split(" ")[0]} />
          </View>
        </View>
      </View>
    </View>
  );
}

function Stat({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Ionicons name={icon} size={10} color="#D9953A" />
        <Text style={{ color: "#D9953A", fontSize: 8, letterSpacing: 1, fontWeight: "800" }}>{label}</Text>
      </View>
      <Text style={{ color: "#FFF", fontFamily: fonts.display, fontSize: 16, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

// =================== STYLES ===================

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingTop: spacing.xxl + spacing.sm, paddingBottom: spacing.md },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  title: { color: "#FFF", fontFamily: fonts.display, fontSize: 18 },

  canvasWrap: { alignItems: "center", paddingVertical: spacing.lg },
  canvasShadow: { ...shadow.card, shadowOpacity: 0.4, shadowRadius: 24 },

  kicker: { color: "#D9953A", fontSize: 10, letterSpacing: 2.5, fontWeight: "800", marginBottom: spacing.sm },

  // Photo strip
  stripBlock: { paddingHorizontal: spacing.lg, marginTop: spacing.md },
  stripHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stripClear: { color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: "700", letterSpacing: 1, textDecorationLine: "underline" },
  stripRow: { gap: spacing.sm, paddingVertical: 4, paddingRight: spacing.lg },
  stripThumbWrap: { width: 80, height: 100, borderRadius: radius.md, overflow: "visible", position: "relative" },
  stripThumb: { width: 80, height: 100, borderRadius: radius.md, backgroundColor: "#2A2722" },
  stripRemove: { position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: "#C85A40", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.surfaceInverse },
  stripIndex: { position: "absolute", bottom: 4, left: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: "rgba(0,0,0,0.6)" },
  stripIndexText: { color: "#FFF", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  stripAddTile: { width: 80, height: 100, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand, gap: 2 },
  stripAddTileAlt: { backgroundColor: "rgba(200,90,64,0.12)", borderWidth: 1, borderColor: colors.brand },
  stripAddText: { color: "#FFF", fontSize: 11, fontWeight: "700", marginTop: 2 },
  stripAddHint: { color: "rgba(255,255,255,0.85)", fontSize: 9, fontWeight: "600" },

  frameRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },
  frameChip: { flexShrink: 0, height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)" },
  frameChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  frameChipText: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "700" },

  captionBlock: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  captionInput: { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: radius.md, padding: spacing.md, color: "#FFF", fontSize: 14, minHeight: 48, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  captionCount: { color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 4, alignSelf: "flex-end" },

  actionRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: spacing.md, borderRadius: radius.pill },
  actionAlt:   { backgroundColor: "rgba(255,255,255,0.1)" },
  actionSave:  { backgroundColor: colors.brandSecondary },
  actionShare: { backgroundColor: colors.brand },
  actionText: { color: "#FFF", fontWeight: "700", fontSize: 13 },

  socialHints: { paddingHorizontal: spacing.lg, marginTop: spacing.xl, alignItems: "center" },
  socialHintsTitle: { color: "rgba(255,255,255,0.5)", fontSize: 11, letterSpacing: 1.5, fontWeight: "700", marginBottom: spacing.sm },
  socialIcons: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", justifyContent: "center" },
  socialBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.08)", paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  socialBadgeText: { color: "#FFF", fontSize: 11, fontWeight: "600" },
});
