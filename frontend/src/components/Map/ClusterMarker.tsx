/**
 * Bubble shown in place of a group of nearby markers. Size + shade scale
 * with the child count so dense areas stand out. Tapping expands (parent
 * screen animates the camera to the cluster's expansion zoom).
 */
import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

type Props = { count: number; visitedRatio?: number };

function ClusterMarkerImpl({ count, visitedRatio = 0 }: Props) {
  const size = count < 5 ? 38 : count < 15 ? 46 : 56;
  const bg = visitedRatio >= 1 ? "#1E6B42" :
             visitedRatio >= 0.6 ? "#2E8B57" :
             count < 5 ? "#C85A40" : count < 15 ? "#B14A32" : "#8E3823";
  return (
    <View
      style={[styles.bubble, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}
      accessibilityLabel={`${count} places in this area`}
    >
      <Text style={styles.count}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    borderWidth: 3, borderColor: "#fff",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.28, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  count: { color: "#fff", fontWeight: "800", fontSize: 14 },
});

export const ClusterMarker = memo(ClusterMarkerImpl);
