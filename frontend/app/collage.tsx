import { useEffect, useRef, useState } from "react";
import {
  Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text,
  TextInput, View, KeyboardAvoidingView,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import * as Haptics from "expo-haptics";
import ViewShot from "react-native-view-shot";
import { api, type City, type Progress } from "@/src/api";
import { useApp, getAvatarUri } from "@/src/store";
import { addPostcard, type Postcard } from "@/src/postcards";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

type Frame = "postcard" | "polaroid" | "magazine" | "xp";

const FRAMES: { id: Frame; label: string }[] = [
  { id: "postcard", label: "Postcard" },
  { id: "polaroid", label: "Polaroid" },
  { id: "magazine", label: "Magazine" },
  { id: "xp",       label: "XP Card"  },
];

export default function CollageScreen() {
  const router = useRouter();
  const { activeCityId, deviceId } = useApp();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [frame, setFrame] = useState<Frame>("postcard");
  const [caption, setCaption] = useState("");
  const [city, setCity] = useState<City | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shotRef = useRef<ViewShot>(null);

  useEffect(() => {
    api.city(activeCityId).then(setCity).catch(console.warn);
    if (deviceId) api.progress(deviceId).then(setProgress).catch(console.warn);
    getAvatarUri().then(setAvatarUri).catch(console.warn);
  }, [activeCityId, deviceId]);

  // ----- permissions helpers -----

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

  const takePhoto = async () => {
    const { status, canAskAgain } = await ImagePicker.getCameraPermissionsAsync();
    let ok = status === "granted";
    if (!ok && canAskAgain) {
      const r = await ImagePicker.requestCameraPermissionsAsync();
      ok = r.status === "granted";
    }
    if (!ok) {
      Alert.alert("Camera disabled", "Enable camera access to capture postcard photos.", [
        { text: "Cancel", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.9,
      aspect: [4, 5],
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const pickFromLibrary = async () => {
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
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.9,
      aspect: [4, 5],
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
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
    if (!photoUri) return;
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
    if (!photoUri) return;
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
                photoUri={photoUri}
                frame={frame}
                cityName={city?.name ?? "Your City"}
                country={city?.country ?? ""}
                caption={caption}
                xp={progress?.xp ?? 0}
                level={progress?.title ?? "Newcomer"}
                quests={progress?.completed_quests.length ?? 0}
                avatarUri={avatarUri}
              />
            </ViewShot>
          </View>

          {!photoUri && (
            <View style={styles.pickerBlock}>
              <Text style={styles.kicker}>STEP 1 — ADD A PHOTO</Text>
              <View style={styles.pickerRow}>
                <Pressable style={styles.pickBtn} onPress={takePhoto} testID="collage-take-photo">
                  <Ionicons name="camera" size={22} color="#FFF" />
                  <Text style={styles.pickBtnText}>Take photo</Text>
                </Pressable>
                <Pressable style={[styles.pickBtn, styles.pickBtnAlt]} onPress={pickFromLibrary} testID="collage-pick-photo">
                  <Ionicons name="images" size={22} color={colors.brand} />
                  <Text style={[styles.pickBtnText, { color: colors.brand }]}>From library</Text>
                </Pressable>
              </View>
            </View>
          )}

          {photoUri && (
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
                  onPress={() => { setPhotoUri(null); setCaption(""); }}
                  disabled={busy}
                  testID="collage-replace"
                >
                  <Ionicons name="refresh" size={18} color="#FFF" />
                  <Text style={styles.actionText}>Replace photo</Text>
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
  photoUri: string | null;
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

function PhotoOrPlaceholder({ uri }: { uri: string | null }) {
  if (uri) return <Image source={uri} style={{ width: "100%", height: "100%" }} contentFit="cover" />;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#2A2722" }}>
      <Ionicons name="image-outline" size={48} color="#666" />
      <Text style={{ color: "#888", marginTop: 8 }}>Add a photo to preview</Text>
    </View>
  );
}

function PostcardFrame(p: CanvasProps) {
  return (
    <View style={{ flex: 1, backgroundColor: "#F5EFE3", padding: 14 }}>
      <View style={{ flex: 1, overflow: "hidden", borderRadius: 4 }}>
        <PhotoOrPlaceholder uri={p.photoUri} />
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
        <PhotoOrPlaceholder uri={p.photoUri} />
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
      <PhotoOrPlaceholder uri={p.photoUri} />
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
        <PhotoOrPlaceholder uri={p.photoUri} />
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

  pickerBlock: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  pickerRow: { flexDirection: "row", gap: spacing.md },
  pickBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brand, paddingVertical: spacing.md, borderRadius: radius.pill },
  pickBtnAlt: { backgroundColor: "rgba(200,90,64,0.12)", borderWidth: 1, borderColor: colors.brand },
  pickBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },

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
