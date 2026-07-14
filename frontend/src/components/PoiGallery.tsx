/**
 * PoiGallery — horizontal photo strip + full-screen swipeable viewer.
 *
 * Two lightweight surfaces:
 *   1) A horizontal thumbnail strip that renders below the POI hero when
 *      `metadata.gallery` (returned as `poi.gallery`) has ≥ 1 curated
 *      image. Each thumb is tappable.
 *   2) A full-screen `Modal` with a paged FlatList that lets the user
 *      swipe between images, shows a counter (e.g. "3 / 5"), and closes
 *      via a top-right ✕ or the hardware back button.
 *
 * No external image-viewer dependency — Modal + FlatList paging is enough
 * for MVP; pinch-to-zoom can be layered on later with
 * `react-native-gesture-handler` if the product needs it.
 */
import { useState } from "react";
import {
  Dimensions, FlatList, Modal, Pressable, StyleSheet, Text, View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/src/theme";

type Props = {
  images: string[];    // curated URLs — safe / filtered by backend
  heroImage?: string;  // include hero as first slide in viewer (optional)
};

export default function PoiGallery({ images, heroImage }: Props) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  if (!images || images.length === 0) return null;

  // Compose the viewer set: hero (if provided and not already duplicated in
  // the gallery) followed by the curated gallery. That way tapping any
  // thumb still shows a rich context even if the gallery is short.
  const viewerImages = heroImage && !images.includes(heroImage)
    ? [heroImage, ...images]
    : images;

  const openAt = (uri: string) => {
    const i = viewerImages.indexOf(uri);
    setIndex(i >= 0 ? i : 0);
    setOpen(true);
  };

  return (
    <View style={styles.wrap} testID="poi-gallery">
      <View style={styles.headerRow}>
        <Text style={styles.title}>Photos</Text>
        <Text style={styles.count}>{images.length}</Text>
      </View>
      <FlatList
        horizontal
        data={images}
        keyExtractor={(u, i) => `${i}-${u}`}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openAt(item)}
            style={styles.thumbWrap}
            testID={`gallery-thumb-${item}`}
          >
            <Image source={item} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
          </Pressable>
        )}
      />
      <FullscreenViewer
        visible={open}
        images={viewerImages}
        startIndex={index}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

function FullscreenViewer({
  visible, images, startIndex, onClose,
}: {
  visible: boolean;
  images: string[];
  startIndex: number;
  onClose: () => void;
}) {
  const { width: screenW, height: screenH } = Dimensions.get("window");
  const [i, setI] = useState(startIndex);

  // Reset the index whenever the viewer opens with a new startIndex so
  // consecutive taps on different thumbs land on the right slide.
  const handleShow = () => setI(startIndex);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onShow={handleShow}
      onRequestClose={onClose}
    >
      <View style={styles.viewer}>
        <FlatList
          data={images}
          horizontal
          pagingEnabled
          initialScrollIndex={startIndex}
          getItemLayout={(_, index) => ({ length: screenW, offset: screenW * index, index })}
          onMomentumScrollEnd={(e) => {
            const next = Math.round(e.nativeEvent.contentOffset.x / screenW);
            if (!Number.isNaN(next)) setI(next);
          }}
          keyExtractor={(u, k) => `v-${k}`}
          renderItem={({ item }) => (
            <View style={{ width: screenW, height: screenH, justifyContent: "center", alignItems: "center" }}>
              <Image source={item} style={{ width: screenW, height: screenH * 0.9 }} contentFit="contain" />
            </View>
          )}
          showsHorizontalScrollIndicator={false}
          bounces={false}
        />
        {/* Counter pill — top center */}
        {images.length > 1 && (
          <View style={styles.counter}>
            <Text style={styles.counterText}>{i + 1} / {images.length}</Text>
          </View>
        )}
        {/* Close */}
        <Pressable
          onPress={onClose}
          style={styles.close}
          testID="gallery-close"
          hitSlop={12}
        >
          <Ionicons name="close" size={26} color="#FFF" />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.lg, marginBottom: spacing.md },
  headerRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  title: { fontSize: 15, fontWeight: "800", color: colors.onSurface, letterSpacing: 0.3 },
  count: { fontSize: 12, color: colors.muted, fontWeight: "700" },
  strip: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  thumbWrap: {
    width: 140, height: 100, borderRadius: radius.md, overflow: "hidden",
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
  },
  viewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.96)" },
  counter: {
    position: "absolute", top: 60, alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.12)", paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 999,
  },
  counterText: { color: "#FFF", fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  close: {
    position: "absolute", top: 50, right: 20,
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
});
