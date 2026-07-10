import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api, type CityQuestProgress, type Quest } from "@/src/api";
import { useApp } from "@/src/store";
import { SkeletonList } from "@/src/components/Skeleton";
import { colors, difficultyColor, fonts, radius, shadow, spacing } from "@/src/theme";

const DIFFICULTIES = [
  { id: "all", label: "All" },
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
];

export default function QuestScreen() {
  const { activeCityId, deviceId, progressVersion } = useApp();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [difficulty, setDifficulty] = useState("all");
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, CityQuestProgress>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [q, prog, cqp] = await Promise.all([
        api.quests(activeCityId, difficulty),
        deviceId ? api.progress(deviceId) : Promise.resolve({ completed_quests: [] } as any),
        // Backend batch endpoint — one request returns { quest_id, current,
        // need, percent, completed } for every quest in the active city.
        deviceId ? api.cityQuestsProgress(activeCityId, deviceId).catch(() => []) : Promise.resolve([]),
      ]);
      setQuests(q);
      setCompletedIds(prog.completed_quests || []);
      const map: Record<string, CityQuestProgress> = {};
      (cqp || []).forEach((r) => { map[r.quest_id] = r; });
      setProgressMap(map);
    } catch (e) { console.warn(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { setLoading(true); load(); }, [activeCityId, difficulty, deviceId, progressVersion]);

  const stats = useMemo(() => {
    const total = quests.length;
    const done = quests.filter(q => completedIds.includes(q.id)).length;
    const xp = quests.filter(q => completedIds.includes(q.id)).reduce((s, q) => s + q.xp_reward, 0);
    return { total, done, xp };
  }, [quests, completedIds]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="quest-screen">
      <View style={styles.header}>
        <Text style={styles.kicker}>QUEST BOARD</Text>
        <Text style={styles.h1}>Your adventures</Text>
        <View style={styles.statsRow}>
          <Stat label="Completed" value={`${stats.done}/${stats.total}`} icon="checkmark-circle-outline" />
          <Stat label="XP from quests" value={`${stats.xp}`} icon="flash-outline" tint={colors.brand} />
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        testID="quest-difficulty-row"
      >
        {DIFFICULTIES.map((d) => {
          const active = difficulty === d.id;
          return (
            <Pressable
              key={d.id}
              onPress={() => setDifficulty(d.id)}
              style={[styles.chip, active && { backgroundColor: colors.onSurface, borderColor: colors.onSurface }]}
              testID={`quest-chip-${d.id}`}
            >
              <Text style={[styles.chipText, active && { color: "#FFF" }]}>{d.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <FlatList
        data={quests}
        keyExtractor={(q) => q.id}
        renderItem={({ item }) => {
          const done = completedIds.includes(item.id);
          const p = progressMap[item.id];
          // Fall back to a 0/0 sentinel when the batch endpoint hasn't
          // resolved yet — QuestCard hides the bar in that case.
          const visited = done ? (p?.need ?? 0) : (p?.current ?? 0);
          const total = p?.need ?? 0;
          const percent = done ? 100 : (p?.percent ?? 0);
          return <QuestCard quest={item} completed={done} visited={visited} total={total} percent={percent} />;
        }}
        contentContainerStyle={{ paddingBottom: 120, paddingTop: spacing.sm }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={loading ? <SkeletonList /> : <Text style={styles.empty}>No quests yet.</Text>}
      />
    </View>
  );
}

function Stat({ label, value, icon, tint = colors.onSurface }: { label: string; value: string; icon: any; tint?: string }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={16} color={tint} />
      <View>
        <Text style={[styles.statValue, { color: tint }]}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );
}

function QuestCard({ quest, completed, visited, total, percent }: { quest: Quest; completed: boolean; visited: number; total: number; percent: number }) {
  const router = useRouter();
  const diffColor = difficultyColor(quest.difficulty);
  // Clamp defensively so stale local data never renders "3/2 · 150%".
  const safeVisited = Math.min(Math.max(visited, 0), Math.max(total, 0));
  const pct = Math.max(0, Math.min(100, percent));
  const started = safeVisited > 0 && !completed;
  return (
    <Pressable
      style={styles.qcard}
      onPress={() => router.push(`/quest/${quest.id}`)}
      testID={`quest-card-${quest.id}`}
    >
      <Image source={quest.cover_image} style={styles.qcardImage} contentFit="cover" />
      <View style={styles.qcardOverlay} />
      <View style={styles.qcardTopRow}>
        <View style={[styles.diffBadge, { backgroundColor: diffColor }]}>
          <Text style={styles.diffText}>{quest.difficulty.toUpperCase()}</Text>
        </View>
        {completed ? (
          <View style={styles.doneBadge}>
            <Ionicons name="checkmark" size={12} color="#FFF" />
            <Text style={styles.doneText}>Done</Text>
          </View>
        ) : started ? (
          <View style={styles.inProgressBadge} testID={`quest-inprogress-${quest.id}`}>
            <Ionicons name="play" size={10} color="#FFF" />
            <Text style={styles.doneText}>In progress</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.qcardBody}>
        <Text style={styles.qcardTitle} numberOfLines={2}>{quest.title}</Text>
        <Text style={styles.qcardDesc} numberOfLines={2}>{quest.description}</Text>
        {total > 0 && (
          <View style={styles.qProgress} testID={`quest-progress-${quest.id}`}>
            <View style={styles.qProgressTrack}>
              <View
                style={[
                  styles.qProgressFill,
                  {
                    width: `${pct}%`,
                    backgroundColor: completed ? colors.success : colors.brandSecondary,
                  },
                ]}
              />
            </View>
            <Text style={styles.qProgressText} testID={`quest-progress-text-${quest.id}`}>
              {safeVisited}/{total} steps · {pct}%
            </Text>
          </View>
        )}
        <View style={styles.qcardMeta}>
          <View style={styles.metaItem}>
            <Ionicons name="flash" size={12} color="#FFF" />
            <Text style={styles.metaText}>+{quest.xp_reward} XP</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={12} color="#FFF" />
            <Text style={styles.metaText}>{quest.estimated_minutes}m</Text>
          </View>
          {quest.badge_name && (
            <View style={styles.metaItem}>
              <Ionicons name="ribbon-outline" size={12} color="#FFF" />
              <Text style={styles.metaText} numberOfLines={1}>{quest.badge_name}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.xxxl + spacing.md, paddingBottom: spacing.md, backgroundColor: colors.surface },
  kicker: { fontSize: 11, letterSpacing: 2, fontWeight: "700", color: colors.brand },
  h1: { fontFamily: fonts.display, fontSize: 30, color: colors.onSurface, marginTop: 4, marginBottom: spacing.md },
  statsRow: { flexDirection: "row", gap: spacing.md },
  stat: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  statValue: { fontSize: 16, fontWeight: "700" },
  statLabel: { fontSize: 11, color: colors.muted, marginTop: 2 },
  chipRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingVertical: spacing.sm, alignItems: "center", height: 56, backgroundColor: colors.surface },
  chip: { flexShrink: 0, height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceTertiary },
  qcard: { marginHorizontal: spacing.lg, height: 220, borderRadius: radius.lg, overflow: "hidden", ...shadow.card },
  qcardImage: { width: "100%", height: "100%", position: "absolute" },
  qcardOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(28,26,23,0.55)" },
  qcardTopRow: { flexDirection: "row", justifyContent: "space-between", padding: spacing.md },
  diffBadge: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
  diffText: { color: "#FFF", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  doneBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.success, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  inProgressBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brandSecondary, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  doneText: { color: "#FFF", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  qcardBody: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg },
  qcardTitle: { fontFamily: fonts.display, color: "#FFF", fontSize: 22, marginBottom: 4 },
  qcardDesc: { color: "rgba(255,255,255,0.9)", fontSize: 13, lineHeight: 18, marginBottom: spacing.sm },
  qProgress: { marginBottom: spacing.sm },
  qProgressTrack: { height: 5, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 3, overflow: "hidden" },
  qProgressFill: { height: "100%", borderRadius: 3 },
  qProgressText: { color: "rgba(255,255,255,0.92)", fontSize: 11, fontWeight: "700", marginTop: 4, letterSpacing: 0.3 },
  qcardMeta: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.4)", paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  metaText: { color: "#FFF", fontSize: 11, fontWeight: "600" },
  empty: { textAlign: "center", color: colors.muted, padding: spacing.xl },
});
