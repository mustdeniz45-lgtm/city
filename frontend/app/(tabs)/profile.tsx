import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, TextInput } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api, type LeaderEntry, type Progress } from "@/src/api";
import { useApp, getDisplayName, setDisplayName } from "@/src/store";
import { listPostcards, removePostcard, type Postcard } from "@/src/postcards";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

export default function ProfileScreen() {
  const router = useRouter();
  const { deviceId, progressVersion } = useApp();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [board, setBoard] = useState<LeaderEntry[]>([]);
  const [postcards, setPostcards] = useState<Postcard[]>([]);
  const [name, setName] = useState("Traveler");
  const [editing, setEditing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!deviceId) return;
    try {
      const [p, b, n, pc] = await Promise.all([
        api.progress(deviceId),
        api.leaderboard(),
        getDisplayName(),
        listPostcards(),
      ]);
      setProgress(p); setBoard(b); setName(n); setPostcards(pc);
    } catch (e) { console.warn(e); }
    finally { setRefreshing(false); }
  }, [deviceId]);

  useEffect(() => { load(); }, [load, progressVersion]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onSaveName = async () => {
    await setDisplayName(name.trim() || "Traveler");
    setEditing(false);
  };

  const onDeletePostcard = (id: string) => {
    Alert.alert("Delete postcard?", "This will remove the postcard from your Profile.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => setPostcards(await removePostcard(id)) },
    ]);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.surface }}
      contentContainerStyle={{ paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      testID="profile-screen"
    >
      <View style={styles.header}>
        <Image
          source={"https://images.unsplash.com/photo-1598966739654-5e9a252d8c32?w=400&q=80"}
          style={styles.avatar}
          contentFit="cover"
        />
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          {editing ? (
            <View style={styles.nameRow}>
              <TextInput
                value={name}
                onChangeText={setName}
                style={styles.nameInput}
                maxLength={24}
                autoFocus
                testID="profile-name-input"
              />
              <Pressable onPress={onSaveName} style={styles.saveBtn} testID="profile-name-save">
                <Ionicons name="checkmark" size={18} color="#FFF" />
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setEditing(true)} style={styles.nameRow} testID="profile-name-edit">
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
              <Ionicons name="pencil" size={14} color={colors.muted} />
            </Pressable>
          )}
          <Text style={styles.level}>Lvl {progress?.level ?? 1} · {progress?.title ?? "Newcomer"}</Text>
          <View style={styles.xpBar}>
            <View style={[styles.xpFill, { width: `${Math.round((progress?.progress ?? 0) * 100)}%` }]} />
          </View>
          <Text style={styles.xpText}>
            {progress?.xp ?? 0} XP
            {progress && progress.next_threshold > progress.xp ? ` · ${progress.next_threshold - progress.xp} to next` : " · MAX"}
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <StatBox value={`${progress?.completed_quests.length ?? 0}`} label="Quests" />
        <StatBox value={`${progress?.badges.length ?? 0}`} label="Badges" />
        <StatBox value={`${progress?.xp ?? 0}`} label="Total XP" />
      </View>

      <Section title="Postcards" testIdSuffix="postcards">
        <View style={styles.postcardWrap}>
          <Pressable
            style={styles.createCard}
            onPress={() => router.push("/collage")}
            testID="create-postcard-btn"
          >
            <View style={styles.createIcon}>
              <Ionicons name="add" size={28} color="#FFF" />
            </View>
            <Text style={styles.createTitle}>Create postcard</Text>
            <Text style={styles.createSub}>Photo + frame · shareable</Text>
          </Pressable>
          {postcards.length === 0 ? (
            <View style={styles.postcardEmpty}>
              <Ionicons name="image-outline" size={26} color={colors.muted} />
              <Text style={styles.emptyText}>{"Tap \u201cCreate postcard\u201d to make your first shareable memory."}</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.postcardRow}>
              {postcards.map((pc) => (
                <Pressable
                  key={pc.id}
                  style={styles.postcardThumb}
                  onLongPress={() => onDeletePostcard(pc.id)}
                  testID={`postcard-${pc.id}`}
                >
                  <Image source={pc.uri} style={styles.postcardImg} contentFit="cover" />
                  <View style={styles.postcardOverlay}>
                    <Text style={styles.postcardCity} numberOfLines={1}>{pc.city}</Text>
                    <Text style={styles.postcardFrame}>{pc.frame.toUpperCase()}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )}
          {postcards.length > 0 && (
            <Text style={styles.tipText}>Long-press a postcard to delete.</Text>
          )}
        </View>
      </Section>

      <Section title="Badges" testIdSuffix="badges">
        {progress && progress.badges.length > 0 ? (
          <View style={styles.badgeGrid}>
            {progress.badges.map((b) => (
              <View key={b} style={styles.badge} testID={`badge-${b}`}>
                <View style={styles.badgeIcon}>
                  <Ionicons name="ribbon" size={22} color="#FFF" />
                </View>
                <Text style={styles.badgeName} numberOfLines={2}>{b}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyBox}>
            <Ionicons name="ribbon-outline" size={28} color={colors.muted} />
            <Text style={styles.emptyText}>Complete quests to unlock badges.</Text>
          </View>
        )}
      </Section>

      <Section title="Leaderboard" testIdSuffix="leaderboard">
        <View style={styles.boardCard}>
          {board.length === 0 ? (
            <Text style={styles.emptyText}>No travelers yet. Be the first!</Text>
          ) : (
            board.slice(0, 10).map((e, i) => (
              <View key={e.device_id} style={[styles.boardRow, i < board.length - 1 && styles.boardDivider, e.device_id === deviceId && styles.boardMe]}>
                <Text style={styles.boardRank}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.boardName} numberOfLines={1}>
                    {e.display_name} {e.device_id === deviceId ? "(you)" : ""}
                  </Text>
                  <Text style={styles.boardMeta}>Lvl {e.level} · {e.title}</Text>
                </View>
                <View style={styles.boardXp}>
                  <Ionicons name="flash" size={12} color={colors.brand} />
                  <Text style={styles.boardXpText}>{e.xp}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children, testIdSuffix }: { title: string; children: any; testIdSuffix: string }) {
  return (
    <View style={{ marginTop: spacing.xl }} testID={`profile-section-${testIdSuffix}`}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={{ paddingHorizontal: spacing.lg }}>{children}</View>
    </View>
  );
}

function StatBox({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.xxxl + spacing.md, paddingBottom: spacing.lg, backgroundColor: colors.surface },
  avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: colors.brand },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurface },
  nameInput: { flex: 1, fontFamily: fonts.display, fontSize: 22, color: colors.onSurface, borderBottomWidth: 1, borderBottomColor: colors.brand, paddingBottom: 2 },
  saveBtn: { backgroundColor: colors.brand, width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  level: { color: colors.brand, fontWeight: "700", fontSize: 12, marginTop: 2, letterSpacing: 0.5 },
  xpBar: { height: 8, backgroundColor: colors.surfaceTertiary, borderRadius: 4, marginTop: spacing.sm, overflow: "hidden" },
  xpFill: { height: "100%", backgroundColor: colors.brand, borderRadius: 4 },
  xpText: { fontSize: 11, color: colors.muted, marginTop: 4, fontWeight: "600" },
  statsRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  statBox: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  statValue: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurface },
  statLabel: { fontSize: 11, color: colors.muted, marginTop: 2, fontWeight: "600", letterSpacing: 0.5 },
  sectionTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  badgeGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  badge: { width: "30%", alignItems: "center", backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  badgeIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  badgeName: { fontSize: 11, fontWeight: "700", color: colors.onSurface, textAlign: "center" },
  emptyBox: { alignItems: "center", padding: spacing.xl, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  emptyText: { color: colors.muted, fontSize: 13, textAlign: "center" },
  boardCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, ...shadow.pill },
  boardRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  boardDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  boardMe: { backgroundColor: "#FCE9E1" },
  boardRank: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, width: 24, textAlign: "center" },
  boardName: { fontWeight: "700", color: colors.onSurface, fontSize: 14 },
  boardMeta: { color: colors.muted, fontSize: 11, marginTop: 2 },
  boardXp: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#FCE9E1", paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  boardXpText: { color: colors.brand, fontWeight: "700", fontSize: 12 },

  // Postcards
  postcardWrap: { gap: spacing.md },
  createCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, alignItems: "center", borderStyle: "dashed", ...shadow.pill },
  createIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  createTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface },
  createSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  postcardEmpty: { alignItems: "center", paddingVertical: spacing.md, gap: 6 },
  postcardRow: { gap: spacing.md, paddingVertical: 4, paddingRight: spacing.lg },
  postcardThumb: { width: 130, height: 170, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  postcardImg: { width: "100%", height: "100%" },
  postcardOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.55)", padding: 6 },
  postcardCity: { color: "#FFF", fontFamily: fonts.display, fontSize: 13 },
  postcardFrame: { color: colors.brandSecondary, fontSize: 8, fontWeight: "800", letterSpacing: 1.5, marginTop: 1 },
  tipText: { fontSize: 11, color: colors.muted, fontStyle: "italic" },
});
