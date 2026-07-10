import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, TextInput } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import { api, ApiError, type FriendEntry, type LeaderEntry, type Progress, type CityProgress } from "@/src/api";
import { useApp, getDisplayName, setDisplayName, getAvatarUri, setAvatarUri } from "@/src/store";
import { listPostcards, removePostcard, type Postcard } from "@/src/postcards";
import { listFriends, addFriend, removeFriend, normalizeCode, type SavedFriend } from "@/src/friends";
import { useAuth } from "@/src/auth";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1598966739654-5e9a252d8c32?w=400&q=80";

export default function ProfileScreen() {
  const router = useRouter();
  const { deviceId, progressVersion, refreshProgress } = useApp();
  const { user, signOut } = useAuth();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [board, setBoard] = useState<LeaderEntry[]>([]);
  const [postcards, setPostcards] = useState<Postcard[]>([]);
  const [cityProgress, setCityProgress] = useState<CityProgress[]>([]);
  const [name, setName] = useState("Traveler");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Friends state — friend list is device-local; friendBoard is the batched
  // XP-sorted resolution of those codes served by /api/friends/leaderboard.
  const [friends, setFriends] = useState<SavedFriend[]>([]);
  const [friendBoard, setFriendBoard] = useState<FriendEntry[]>([]);
  const [boardTab, setBoardTab] = useState<"global" | "friends">("global");
  const [addOpen, setAddOpen] = useState(false);
  const [addInput, setAddInput] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  const load = useCallback(async () => {
    if (!deviceId) return;
    try {
      const [p, b, n, pc, cp, av, fr] = await Promise.all([
        api.progress(deviceId),
        api.leaderboard(),
        getDisplayName(),
        listPostcards(),
        api.progressByCity(deviceId),
        getAvatarUri(),
        listFriends(),
      ]);
      setProgress(p); setBoard(b); setName(n); setPostcards(pc); setCityProgress(cp); setAvatar(av);
      setFriends(fr);
      // Resolve friend leaderboard in a second, non-blocking step so the
      // main profile paint isn't gated on it. Skip if there are no friends.
      if (fr.length > 0) {
        try {
          const fb = await api.friendsLeaderboard(fr.map((f) => f.code));
          setFriendBoard(fb);
        } catch (e) { console.warn("friend board", e); }
      } else {
        setFriendBoard([]);
      }
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

  // ---- Avatar picker ----
  const launchPicker = async (mode: "camera" | "library") => {
    const ensure = mode === "camera"
      ? ImagePicker.getCameraPermissionsAsync
      : ImagePicker.getMediaLibraryPermissionsAsync;
    const request = mode === "camera"
      ? ImagePicker.requestCameraPermissionsAsync
      : ImagePicker.requestMediaLibraryPermissionsAsync;
    const { status, canAskAgain } = await ensure();
    let ok = status === "granted";
    if (!ok && canAskAgain) {
      const r = await request();
      ok = r.status === "granted";
    }
    if (!ok) {
      Alert.alert(
        mode === "camera" ? "Camera disabled" : "Photo access disabled",
        "Enable access in Settings to update your avatar.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    const result = mode === "camera"
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.85 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.85,
        });
    if (!result.canceled && result.assets[0]) {
      let uri = result.assets[0].uri;
      // On web (or blob URLs) persist as data URI so it survives reload.
      if (Platform.OS === "web" && uri.startsWith("blob:")) {
        try {
          const resp = await fetch(uri);
          const blob = await resp.blob();
          uri = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (e) { console.warn("blob->data", e); }
      }
      // On native, convert local file:// URI to base64 data URI so it can be
      // synced to the cloud + shown on the leaderboard for everyone.
      let cloudUri = uri;
      if (Platform.OS !== "web" && uri.startsWith("file:")) {
        try {
          const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
          cloudUri = `data:image/jpeg;base64,${b64}`;
        } catch (e) { console.warn("file->base64", e); }
      }
      await setAvatarUri(uri);
      setAvatar(uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (deviceId) api.updateProfile(deviceId, { avatar_uri: cloudUri }).catch(console.warn);
    }
  };

  const onPressAvatar = () => {
    const opts: { text: string; onPress?: () => void; style?: "cancel" | "destructive" }[] = [
      { text: "Take photo",       onPress: () => launchPicker("camera") },
      { text: "Choose from library", onPress: () => launchPicker("library") },
    ];
    if (avatar) opts.push({ text: "Remove photo", style: "destructive", onPress: async () => {
      await setAvatarUri(null); setAvatar(null);
      if (deviceId) api.updateProfile(deviceId, { avatar_uri: "" }).catch(console.warn);
    }});
    opts.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Update profile picture", "Choose a source", opts);
  };

  // Also sync display name to backend whenever user saves it
  const handleSaveName = async () => {
    const trimmed = name.trim() || "Traveler";
    await setDisplayName(trimmed);
    setEditing(false);
    if (deviceId) api.updateProfile(deviceId, { display_name: trimmed }).catch(console.warn);
  };

  // ---- Friends ----
  const friendCode = progress?.friend_code || null;

  const onCopyCode = async () => {
    if (!friendCode) return;
    try {
      await Clipboard.setStringAsync(friendCode);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Copied!", `Share ${friendCode} with your friends so they can add you.`);
    } catch (e) { console.warn("clipboard", e); }
  };

  const onAddFriend = async () => {
    const raw = normalizeCode(addInput);
    if (!raw || raw.length < 6) {
      Alert.alert("Enter a code", "Friend codes are 6–8 letters/numbers, e.g. CQ7K4P9X.");
      return;
    }
    if (friendCode && raw === normalizeCode(friendCode)) {
      Alert.alert("That's you!", "You can't add your own code as a friend.");
      return;
    }
    setAddBusy(true);
    try {
      const preview = await api.friendLookup(raw);
      const updated = await addFriend(preview.friend_code, preview.display_name);
      setFriends(updated);
      // Refresh the friend board immediately.
      const fb = await api.friendsLeaderboard(updated.map((f) => f.code));
      setFriendBoard(fb);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAddInput("");
      setAddOpen(false);
      setBoardTab("friends");
      Alert.alert("Friend added!", `${preview.display_name} is now on your Friends leaderboard.`);
    } catch (e) {
      const msg = e instanceof ApiError
        ? e.message
        : "Couldn't add that friend. Check the code and try again.";
      Alert.alert("Add friend failed", msg);
    } finally {
      setAddBusy(false);
    }
  };

  const onRemoveFriend = (f: SavedFriend) => {
    Alert.alert(
      `Remove ${f.nickname}?`,
      "They won't appear on your Friends leaderboard anymore. You can always re-add them by their code.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove", style: "destructive",
          onPress: async () => {
            const updated = await removeFriend(f.code);
            setFriends(updated);
            setFriendBoard((prev) => prev.filter((row) => row.friend_code !== f.code));
          },
        },
      ],
    );
  };

  // Merged Friends leaderboard: server rows + a synthetic "you" row so the
  // user can see where they sit against their friends without having to add
  // themselves. We build it with useMemo to avoid recomputing on every render.
  const mergedFriendBoard = useMemo<FriendEntry[]>(() => {
    if (!progress) return friendBoard;
    const meRow: FriendEntry = {
      friend_code: friendCode || "__me__",
      display_name: `${name} (you)`,
      avatar_uri: avatar ?? null,
      xp: progress.xp ?? 0,
      level: progress.level ?? 1,
      title: progress.title ?? "Newcomer",
      badges: progress.badges?.length ?? 0,
      quests: progress.completed_quests?.length ?? 0,
      is_anonymous: false,
    };
    return [...friendBoard, meRow].sort((a, b) => b.xp - a.xp);
  }, [friendBoard, progress, name, avatar, friendCode]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.surface }}
      contentContainerStyle={{ paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      testID="profile-screen"
    >
      <View style={styles.header}>
        <Pressable onPress={onPressAvatar} testID="profile-avatar-btn" style={styles.avatarWrap}>
          <Image
            source={avatar ?? DEFAULT_AVATAR}
            style={styles.avatar}
            contentFit="cover"
            testID="profile-avatar"
          />
          <View style={styles.avatarEdit}>
            <Ionicons name="camera" size={12} color="#FFF" />
          </View>
        </Pressable>
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
              <Pressable onPress={handleSaveName} style={styles.saveBtn} testID="profile-name-save">
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
        <StatBox value={String((progress?.completed_quests ?? []).length)} label="Quests" />
        <StatBox value={String((progress?.badges ?? []).length)} label="Badges" />
        <StatBox value={String(progress?.xp ?? 0)} label="Total XP" />
      </View>

      <Section title="Account" testIdSuffix="account">
        {user ? (
          <View style={styles.accountRow} testID="account-signed-in">
            <View style={styles.accountIcon}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={styles.accountEmail} numberOfLines={1}>{user.email ?? "Signed in"}</Text>
              <Text style={styles.accountSub}>Progress synced across devices</Text>
            </View>
            <Pressable
              hitSlop={10}
              onPress={() => {
                Alert.alert("Sign out?", "Your progress stays on this device, but new XP won't sync.", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Sign out", style: "destructive", onPress: async () => {
                      await signOut();
                      refreshProgress();
                    },
                  },
                ]);
              }}
              style={styles.signOutBtn}
              testID="account-sign-out"
            >
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={styles.accountRow}
            onPress={() => router.push("/auth/welcome")}
            testID="account-sign-in-cta"
          >
            <View style={[styles.accountIcon, { backgroundColor: "#FCE9E1" }]}>
              <Ionicons name="person-add" size={18} color={colors.brand} />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={styles.accountTitle}>Save your progress</Text>
              <Text style={styles.accountSub}>Sign in to back up XP & badges across devices</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        )}
      </Section>

      <Section title="Passport" testIdSuffix="passport">
        <Pressable
          style={styles.passportSummary}
          onPress={() => router.push("/passport")}
          testID="passport-open-btn"
        >
          <View style={styles.passportSummaryLeft}>
            <Ionicons name="airplane" size={14} color={colors.brand} />
            <Text style={styles.passportSummaryText}>
              <Text style={styles.passportSummaryNum}>
                {cityProgress.filter((c) => c.completed).length}
              </Text>
              <Text> / {cityProgress.length || "—"} cities stamped</Text>
            </Text>
          </View>
          <View style={styles.passportDotsRow}>
            {cityProgress.map((c) => (
              <View
                key={c.city_id}
                style={[styles.passportDot, c.completed && { backgroundColor: colors.success }]}
                testID={`passport-dot-${c.city_id}`}
              />
            ))}
            <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ marginLeft: 4 }} />
          </View>
        </Pressable>
      </Section>

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
        {progress && progress.badges && progress.badges.length > 0 ? (
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

      <Section title="Friends" testIdSuffix="friends">
        <View style={styles.friendCodeCard} testID="friend-code-card">
          <View style={{ flex: 1 }}>
            <Text style={styles.friendCodeLabel}>Your friend code</Text>
            {friendCode ? (
              <Text style={styles.friendCodeText} selectable testID="friend-code-value">{friendCode}</Text>
            ) : (
              <Text style={styles.friendCodePending}>Earn some XP to unlock your code</Text>
            )}
          </View>
          <Pressable
            onPress={onCopyCode}
            disabled={!friendCode}
            style={[styles.friendCopyBtn, !friendCode && { opacity: 0.5 }]}
            testID="friend-code-copy"
            hitSlop={10}
          >
            <Ionicons name="copy-outline" size={16} color="#FFF" />
            <Text style={styles.friendCopyText}>Copy</Text>
          </Pressable>
        </View>
        <View style={styles.friendActionsRow}>
          <Pressable
            onPress={() => setAddOpen((v) => !v)}
            style={styles.friendAddBtn}
            testID="friend-add-toggle"
          >
            <Ionicons name={addOpen ? "close" : "person-add"} size={14} color={colors.brand} />
            <Text style={styles.friendAddText}>{addOpen ? "Cancel" : "Add friend by code"}</Text>
          </Pressable>
          <Text style={styles.friendCount}>{friends.length} friend{friends.length === 1 ? "" : "s"}</Text>
        </View>
        {addOpen && (
          <View style={styles.addPanel} testID="friend-add-panel">
            <TextInput
              value={addInput}
              onChangeText={(t) => setAddInput(t.toUpperCase())}
              placeholder="e.g. CQ7K4P9X"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={10}
              style={styles.addInput}
              testID="friend-add-input"
            />
            <Pressable
              onPress={onAddFriend}
              disabled={addBusy}
              style={[styles.addSubmit, addBusy && { opacity: 0.6 }]}
              testID="friend-add-submit"
            >
              <Text style={styles.addSubmitText}>{addBusy ? "Adding…" : "Add"}</Text>
            </Pressable>
          </View>
        )}
        {friends.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.friendChipsRow}
            testID="friend-chips-row"
          >
            {friends.map((f) => (
              <Pressable
                key={f.code}
                onLongPress={() => onRemoveFriend(f)}
                style={styles.friendChip}
                testID={`friend-chip-${f.code}`}
              >
                <Text style={styles.friendChipName} numberOfLines={1}>{f.nickname}</Text>
                <Text style={styles.friendChipCode}>{f.code}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
        {friends.length > 0 && (
          <Text style={styles.tipText}>Long-press a friend to remove them.</Text>
        )}
      </Section>

      <Section title="Leaderboard" testIdSuffix="leaderboard">
        <View style={styles.boardTabsRow} testID="board-tabs">
          <Pressable
            onPress={() => setBoardTab("global")}
            style={[styles.boardTab, boardTab === "global" && styles.boardTabActive]}
            testID="board-tab-global"
          >
            <Ionicons name="earth" size={13} color={boardTab === "global" ? "#FFF" : colors.brand} />
            <Text style={[styles.boardTabText, boardTab === "global" && styles.boardTabTextActive]}>Global</Text>
          </Pressable>
          <Pressable
            onPress={() => setBoardTab("friends")}
            style={[styles.boardTab, boardTab === "friends" && styles.boardTabActive]}
            testID="board-tab-friends"
          >
            <Ionicons name="people" size={13} color={boardTab === "friends" ? "#FFF" : colors.brand} />
            <Text style={[styles.boardTabText, boardTab === "friends" && styles.boardTabTextActive]}>
              Friends{friends.length > 0 ? ` · ${friends.length}` : ""}
            </Text>
          </Pressable>
        </View>
        <View style={styles.boardCard}>
          {boardTab === "global" ? (
            board.length === 0 ? (
              <Text style={styles.emptyText}>No travelers yet. Be the first!</Text>
            ) : (
              board.slice(0, 10).map((e, i) => {
                const isMe = e.device_id === deviceId;
                let renderUri: string | null = null;
                if (isMe && avatar) renderUri = avatar;
                else if (e.avatar_uri && !/^file:\/\//i.test(e.avatar_uri)) renderUri = e.avatar_uri;
                return (
                  <View key={e.device_id} style={[styles.boardRow, i < board.length - 1 && styles.boardDivider, isMe && styles.boardMe]}>
                    <Text style={[styles.boardRank, i === 0 && { color: "#D9953A" }]}>{i + 1}</Text>
                    {renderUri ? (
                      <Image source={renderUri} style={styles.boardAvatar} contentFit="cover" />
                    ) : (
                      <View style={[styles.boardAvatar, styles.boardAvatarFallback]}>
                        <Text style={styles.boardAvatarInitial}>
                          {(e.display_name?.[0] ?? "T").toUpperCase()}
                        </Text>
                      </View>
                    )}
                    {i < 3 && (
                      <View style={[styles.boardMedal, i === 0 && { backgroundColor: "#D9953A" }, i === 1 && { backgroundColor: "#B6B6B6" }, i === 2 && { backgroundColor: "#CD7F32" }]}>
                        <Ionicons name="trophy" size={10} color="#FFF" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.boardName} numberOfLines={1}>
                        {e.display_name} {isMe ? "(you)" : ""}
                      </Text>
                      <Text style={styles.boardMeta}>Lvl {e.level} · {e.title}</Text>
                    </View>
                    <View style={styles.boardXp}>
                      <Ionicons name="flash" size={12} color={colors.brand} />
                      <Text style={styles.boardXpText}>{e.xp}</Text>
                    </View>
                  </View>
                );
              })
            )
          ) : (
            // ---- Friends tab ----
            friends.length === 0 ? (
              <View style={styles.friendsEmpty} testID="friends-empty">
                <Ionicons name="people-outline" size={30} color={colors.muted} />
                <Text style={styles.emptyText}>
                  Add friends by their code to compare progress.
                </Text>
                <Pressable
                  onPress={() => { setBoardTab("global"); setAddOpen(true); }}
                  style={styles.emptyCta}
                  testID="friends-empty-cta"
                >
                  <Text style={styles.emptyCtaText}>Add your first friend</Text>
                </Pressable>
              </View>
            ) : (
              mergedFriendBoard.map((e, i) => {
                const isMe = e.friend_code === (friendCode || "__me__") || e.friend_code === "__me__";
                let renderUri: string | null = null;
                if (isMe && avatar) renderUri = avatar;
                else if (e.avatar_uri && !/^file:\/\//i.test(e.avatar_uri)) renderUri = e.avatar_uri;
                return (
                  <View key={e.friend_code} style={[styles.boardRow, i < mergedFriendBoard.length - 1 && styles.boardDivider, isMe && styles.boardMe]}>
                    <Text style={[styles.boardRank, i === 0 && { color: "#D9953A" }]}>{i + 1}</Text>
                    {renderUri ? (
                      <Image source={renderUri} style={styles.boardAvatar} contentFit="cover" />
                    ) : (
                      <View style={[styles.boardAvatar, styles.boardAvatarFallback]}>
                        <Text style={styles.boardAvatarInitial}>
                          {(e.display_name?.[0] ?? "T").toUpperCase()}
                        </Text>
                      </View>
                    )}
                    {i < 3 && (
                      <View style={[styles.boardMedal, i === 0 && { backgroundColor: "#D9953A" }, i === 1 && { backgroundColor: "#B6B6B6" }, i === 2 && { backgroundColor: "#CD7F32" }]}>
                        <Ionicons name="trophy" size={10} color="#FFF" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.boardName} numberOfLines={1}>{e.display_name}</Text>
                      <Text style={styles.boardMeta}>Lvl {e.level} · {e.title}</Text>
                    </View>
                    <View style={styles.boardXp}>
                      <Ionicons name="flash" size={12} color={colors.brand} />
                      <Text style={styles.boardXpText}>{e.xp}</Text>
                    </View>
                  </View>
                );
              })
            )
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
  boardRank: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, width: 22, textAlign: "center" },
  boardAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  boardAvatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary },
  boardAvatarInitial: { color: "#FFF", fontFamily: fonts.display, fontSize: 16 },
  boardMedal: { position: "absolute", left: 38, top: 8, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: colors.surface },
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

  // Passport
  passportGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, justifyContent: "space-between" },
  passportCard: { width: "48%", aspectRatio: 0.85, borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border, ...shadow.card },
  passportCardDone: { borderColor: colors.success, borderWidth: 2 },
  passportInner: { flex: 1, padding: spacing.md, justifyContent: "space-between" },
  passportTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  passportFlag: { color: "#FFF", fontWeight: "800", fontSize: 10, letterSpacing: 2, backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" },
  passportPct: { backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  passportPctText: { color: "#FFF", fontWeight: "800", fontSize: 11 },
  passportCity: { fontFamily: fonts.display, color: "#FFF", fontSize: 18, marginBottom: 2 },
  passportCountry: { color: "rgba(255,255,255,0.85)", fontSize: 9, letterSpacing: 1.5, fontWeight: "700" },
  passportTrack: { height: 4, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 2, overflow: "hidden", marginTop: 6 },
  passportFill: { height: "100%", borderRadius: 2 },
  passportProgress: { color: "rgba(255,255,255,0.92)", fontSize: 10, fontWeight: "600", marginTop: 4 },
  stamp: { position: "absolute", top: "32%", right: -8, transform: [{ rotate: "-12deg" }], paddingHorizontal: 10, paddingVertical: 5, borderWidth: 3, borderColor: "#B33939", borderRadius: 4, backgroundColor: "rgba(179,57,57,0.15)", alignItems: "center" },
  stampMain: { color: "#B33939", fontFamily: fonts.display, fontWeight: "900", fontSize: 16, letterSpacing: 2 },
  stampSub: { color: "#B33939", fontSize: 8, letterSpacing: 1.5, fontWeight: "800", marginTop: 1 },
  passportSummary: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, ...shadow.pill },
  passportSummaryLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  passportSummaryText: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "600" },
  passportSummaryNum: { fontFamily: fonts.display, fontSize: 20, color: colors.brand },
  passportDotsRow: { flexDirection: "row", gap: 5 },
  passportDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.borderStrong },

  // Account section
  accountRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, ...shadow.pill },
  accountIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#E8F4EE", alignItems: "center", justifyContent: "center" },
  accountTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.onSurface },
  accountEmail: { fontSize: 14, color: colors.onSurface, fontWeight: "700" },
  accountSub: { color: colors.muted, fontSize: 11, marginTop: 2 },
  signOutBtn: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  signOutText: { color: colors.brand, fontWeight: "700", fontSize: 12, letterSpacing: 0.3 },

  // Friends
  friendCodeCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceInverse, padding: spacing.md,
    borderRadius: radius.md, ...shadow.pill,
  },
  friendCodeLabel: { color: "rgba(255,255,255,0.65)", fontSize: 10, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" },
  friendCodeText: { fontFamily: fonts.display, color: "#FFF", fontSize: 24, letterSpacing: 3, marginTop: 4 },
  friendCodePending: { color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 6 },
  friendCopyBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brand, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill },
  friendCopyText: { color: "#FFF", fontWeight: "700", fontSize: 12 },
  friendActionsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md },
  friendAddBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: "#FCE9E1", borderWidth: 1, borderColor: "#F1C3B0" },
  friendAddText: { color: colors.brand, fontWeight: "700", fontSize: 12 },
  friendCount: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  addPanel: { flexDirection: "row", gap: spacing.sm, alignItems: "center", marginTop: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  addInput: { flex: 1, fontFamily: fonts.display, fontSize: 16, color: colors.onSurface, paddingHorizontal: spacing.sm, paddingVertical: 6, letterSpacing: 2 },
  addSubmit: { backgroundColor: colors.brand, paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.pill },
  addSubmitText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  friendChipsRow: { gap: spacing.sm, paddingVertical: spacing.sm },
  friendChip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, maxWidth: 160 },
  friendChipName: { fontFamily: fonts.display, fontSize: 13, color: colors.onSurface },
  friendChipCode: { fontSize: 10, color: colors.muted, letterSpacing: 1, marginTop: 1 },

  // Leaderboard tabs
  boardTabsRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  boardTab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  boardTabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  boardTabText: { color: colors.brand, fontWeight: "700", fontSize: 12 },
  boardTabTextActive: { color: "#FFF" },
  friendsEmpty: { alignItems: "center", padding: spacing.xl, gap: spacing.md },
  emptyCta: { backgroundColor: colors.brand, paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.pill },
  emptyCtaText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
});
