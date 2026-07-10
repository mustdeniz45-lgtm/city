/**
 * Purple Kültür Yolu / quest pin. Numbered by `ky_seq` when present.
 */
import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

type Props = { seq?: number | null; visited?: boolean };

function QuestMarkerImpl({ seq, visited }: Props) {
  return (
    <View style={[styles.pin, visited && styles.visited]} testID="map-quest-marker">
      <Text style={styles.label}>{seq ?? "•"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pin: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: "#7A1F8F", borderWidth: 2, borderColor: "#fff",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  visited: { backgroundColor: "#2E8B57" },
  label: { color: "#fff", fontWeight: "800", fontSize: 12 },
});

export const QuestMarker = memo(QuestMarkerImpl);
