import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetAvatar,
  useListCatalogItems,
  useGetSizeProfile,
  useGetLook,
  getGetLookQueryKey,
  useCreateLook,
  getListLooksQueryKey,
  getGetUserSummaryQueryKey,
  type CatalogItem,
  type LookSelections,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { fonts } from '@/constants/colors';
import {
  Button,
  ErrorView,
  IconButton,
  LoadingView,
  useScreenInsets,
} from '@/components/ui';

type Category = 'hairstyle' | 'beard' | 'shirt' | 'pants' | 'shoes';

const CATEGORIES: {
  key: Category;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
}[] = [
  { key: 'hairstyle', icon: 'content-cut', label: 'Hair' },
  { key: 'beard', icon: 'mustache', label: 'Beard' },
  { key: 'shirt', icon: 'tshirt-crew', label: 'Shirt' },
  { key: 'pants', icon: 'human-male', label: 'Pants' },
  { key: 'shoes', icon: 'shoe-sneaker', label: 'Shoes' },
];

type Selection = { itemId: number; color: string | null };
type SelectionMap = Partial<Record<Category, Selection>>;

function toLookSelections(map: SelectionMap): LookSelections {
  return {
    hairstyleItemId: map.hairstyle?.itemId ?? null,
    hairstyleColor: map.hairstyle?.color ?? null,
    beardItemId: map.beard?.itemId ?? null,
    beardColor: map.beard?.color ?? null,
    shirtItemId: map.shirt?.itemId ?? null,
    shirtColor: map.shirt?.color ?? null,
    pantsItemId: map.pants?.itemId ?? null,
    pantsColor: map.pants?.color ?? null,
    shoesItemId: map.shoes?.itemId ?? null,
    shoesColor: map.shoes?.color ?? null,
  };
}

function fromLookSelections(sel: LookSelections): SelectionMap {
  const map: SelectionMap = {};
  if (sel.hairstyleItemId != null)
    map.hairstyle = { itemId: sel.hairstyleItemId, color: sel.hairstyleColor ?? null };
  if (sel.beardItemId != null)
    map.beard = { itemId: sel.beardItemId, color: sel.beardColor ?? null };
  if (sel.shirtItemId != null)
    map.shirt = { itemId: sel.shirtItemId, color: sel.shirtColor ?? null };
  if (sel.pantsItemId != null)
    map.pants = { itemId: sel.pantsItemId, color: sel.pantsColor ?? null };
  if (sel.shoesItemId != null)
    map.shoes = { itemId: sel.shoesItemId, color: sel.shoesColor ?? null };
  return map;
}

export default function StylingStudio() {
  const { avatarId, applyLookId } = useLocalSearchParams<{
    avatarId: string;
    applyLookId?: string;
  }>();
  const id = Number(avatarId);
  const colors = useColors();
  const insets = useScreenInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const avatarQuery = useGetAvatar(id);
  const catalogQuery = useListCatalogItems();

  const sizeQuery = useGetSizeProfile(id);
  const lookToApply = useGetLook(Number(applyLookId ?? 0), {
    query: {
      enabled: !!applyLookId,
      queryKey: getGetLookQueryKey(Number(applyLookId ?? 0)),
    },
  });

  const [activeCategory, setActiveCategory] = useState<Category>('shirt');
  const [selections, setSelections] = useState<SelectionMap>({});
  const [appliedLookId, setAppliedLookId] = useState<number | null>(null);
  const [showSizes, setShowSizes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lookName, setLookName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  // Apply a saved look passed via route param (from the looks gallery)
  useEffect(() => {
    if (lookToApply.data && lookToApply.data.id !== appliedLookId) {
      setSelections(fromLookSelections(lookToApply.data.selections));
      setAppliedLookId(lookToApply.data.id);
      setSavedBanner(`Applied "${lookToApply.data.name}"`);
      const t = setTimeout(() => setSavedBanner(null), 2500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [lookToApply.data, appliedLookId]);

  const itemsByCategory = useMemo(() => {
    const map = new Map<Category, CatalogItem[]>();
    for (const item of catalogQuery.data ?? []) {
      const cat = item.category as Category;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    }
    return map;
  }, [catalogQuery.data]);

  const itemById = useMemo(() => {
    const map = new Map<number, CatalogItem>();
    for (const item of catalogQuery.data ?? []) map.set(item.id, item);
    return map;
  }, [catalogQuery.data]);

  const createLook = useCreateLook({
    mutation: {
      onSuccess: (look) => {
        queryClient.invalidateQueries({ queryKey: getListLooksQueryKey(id) });
        if (avatarQuery.data) {
          queryClient.invalidateQueries({
            queryKey: getGetUserSummaryQueryKey(avatarQuery.data.userId),
          });
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSaving(false);
        setLookName('');
        setSavedBanner(`Saved "${look.name}"`);
        setTimeout(() => setSavedBanner(null), 2500);
      },
      onError: () => setSaveError("Couldn't save this look. Try again."),
    },
  });

  if (avatarQuery.isLoading || catalogQuery.isLoading) return <LoadingView />;
  if (avatarQuery.isError || catalogQuery.isError) {
    return (
      <ErrorView
        onRetry={() => {
          avatarQuery.refetch();
          catalogQuery.refetch();
        }}
      />
    );
  }

  const avatar = avatarQuery.data!;
  const activeItems = itemsByCategory.get(activeCategory) ?? [];
  const activeSelection = selections[activeCategory];
  const hasAnySelection = Object.keys(selections).length > 0;

  const selectItem = (item: CatalogItem) => {
    Haptics.selectionAsync();
    setSelections((prev) => {
      const current = prev[activeCategory];
      if (current?.itemId === item.id) {
        // Tap the selected item again to remove it
        const next = { ...prev };
        delete next[activeCategory];
        return next;
      }
      return {
        ...prev,
        [activeCategory]: { itemId: item.id, color: item.colors[0] ?? null },
      };
    });
  };

  const selectColor = (color: string) => {
    Haptics.selectionAsync();
    setSelections((prev) => {
      const current = prev[activeCategory];
      if (!current) return prev;
      return { ...prev, [activeCategory]: { ...current, color } };
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <IconButton icon="arrow-left" onPress={() => router.back()} testID="studio-back" />
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerKicker, { color: colors.accent }]}>STUDIO</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
            {avatar.name}
          </Text>
        </View>
        <IconButton
          icon="maximize-2"
          onPress={() => setShowSizes(true)}
          testID="open-sizes"
        />
        <IconButton
          icon="bookmark"
          onPress={() => router.push(`/looks/${id}`)}
          testID="open-looks"
        />
      </View>

      {savedBanner ? (
        <View style={[styles.banner, { backgroundColor: colors.primary }]}>
          <Feather name="check-circle" size={15} color={colors.primaryForeground} />
          <Text style={{ color: colors.primaryForeground, fontFamily: fonts.bodySemi, fontSize: 13 }}>
            {savedBanner}
          </Text>
        </View>
      ) : null}

      {/* Preview area with right-side rail */}
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={[styles.previewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {avatar.facePhotoUrl ? (
            <Image source={{ uri: avatar.facePhotoUrl }} style={styles.face} contentFit="cover" />
          ) : (
            <View style={[styles.face, { backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' }]}>
              <Feather name="user" size={40} color={colors.mutedForeground} />
            </View>
          )}
          <ScrollView contentContainerStyle={{ gap: 8, paddingTop: 14 }} showsVerticalScrollIndicator={false}>
            {CATEGORIES.map((cat) => {
              const sel = selections[cat.key];
              const item = sel ? itemById.get(sel.itemId) : undefined;
              return (
                <View
                  key={cat.key}
                  style={[
                    styles.slotRow,
                    {
                      backgroundColor: item ? colors.secondary : 'transparent',
                      borderColor: colors.border,
                      borderWidth: item ? 0 : StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={cat.icon}
                    size={16}
                    color={item ? colors.foreground : colors.mutedForeground}
                  />
                  <Text
                    numberOfLines={1}
                    style={{
                      flex: 1,
                      fontFamily: item ? fonts.bodySemi : fonts.body,
                      fontSize: 13,
                      color: item ? colors.foreground : colors.mutedForeground,
                    }}
                  >
                    {item ? item.name : `No ${cat.label.toLowerCase()}`}
                  </Text>
                  {sel?.color ? (
                    <View style={[styles.slotSwatch, { backgroundColor: sel.color, borderColor: colors.border }]} />
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        </View>

        {/* Right-side category rail */}
        <View style={styles.rail}>
          {CATEGORIES.map((cat) => {
            const active = activeCategory === cat.key;
            const hasSelection = !!selections[cat.key];
            return (
              <Pressable
                key={cat.key}
                testID={`rail-${cat.key}`}
                onPress={() => {
                  Haptics.selectionAsync();
                  setActiveCategory(cat.key);
                }}
                style={[
                  styles.railButton,
                  {
                    backgroundColor: active ? colors.primary : colors.card,
                    borderColor: hasSelection && !active ? colors.accent : colors.border,
                    borderWidth: hasSelection && !active ? 1.5 : StyleSheet.hairlineWidth,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={cat.icon}
                  size={20}
                  color={active ? colors.primaryForeground : colors.foreground}
                />
                <Text
                  style={{
                    fontFamily: fonts.bodyMedium,
                    fontSize: 10,
                    color: active ? colors.primaryForeground : colors.mutedForeground,
                  }}
                >
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Bottom: items + colors + save */}
      <View style={[styles.bottomPanel, { borderColor: colors.border, paddingBottom: insets.bottom + 10 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}>
          {activeItems.length === 0 ? (
            <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.mutedForeground }}>
              Nothing in this category yet.
            </Text>
          ) : (
            activeItems.map((item) => {
              const selected = activeSelection?.itemId === item.id;
              return (
                <Pressable
                  key={item.id}
                  testID={`item-${item.id}`}
                  onPress={() => selectItem(item)}
                  style={[
                    styles.itemCard,
                    {
                      backgroundColor: selected ? colors.primary : colors.card,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: fonts.bodySemi,
                      fontSize: 13,
                      color: selected ? colors.primaryForeground : colors.foreground,
                    }}
                  >
                    {item.name}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
                    {item.colors.slice(0, 4).map((c) => (
                      <View key={c} style={[styles.miniSwatch, { backgroundColor: c, borderColor: colors.border }]} />
                    ))}
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>

        {activeSelection ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 20, paddingTop: 12 }}>
            {(itemById.get(activeSelection.itemId)?.colors ?? []).map((c) => (
              <Pressable
                key={c}
                testID={`color-${c}`}
                onPress={() => selectColor(c)}
                style={[
                  styles.colorSwatch,
                  {
                    backgroundColor: c,
                    borderColor: activeSelection.color === c ? colors.primary : colors.border,
                    borderWidth: activeSelection.color === c ? 3 : 1,
                  },
                ]}
              />
            ))}
          </ScrollView>
        ) : null}

        <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
          {saving ? (
            <View style={{ gap: 10 }}>
              <TextInput
                testID="look-name"
                value={lookName}
                onChangeText={(t) => {
                  setLookName(t);
                  setSaveError(null);
                }}
                placeholder="Name this look (e.g. Fresh fade Friday)"
                placeholderTextColor={colors.mutedForeground}
                autoFocus
                style={[
                  styles.input,
                  { color: colors.foreground, borderColor: colors.input, fontFamily: fonts.bodyMedium },
                ]}
              />
              {saveError ? (
                <Text style={{ color: colors.destructive, fontFamily: fonts.body, fontSize: 13 }}>
                  {saveError}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button label="Cancel" variant="secondary" onPress={() => setSaving(false)} style={{ flex: 1 }} />
                <Button
                  testID="confirm-save-look"
                  label="Save"
                  icon="bookmark"
                  disabled={!lookName.trim()}
                  loading={createLook.isPending}
                  onPress={() =>
                    createLook.mutate({
                      avatarId: id,
                      data: { name: lookName.trim(), selections: toLookSelections(selections) },
                    })
                  }
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          ) : (
            <Button
              testID="save-look"
              label="Save this look"
              icon="bookmark"
              disabled={!hasAnySelection}
              onPress={() => setSaving(true)}
            />
          )}
        </View>
      </View>

      {/* Size recommendations overlay */}
      {showSizes ? (
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowSizes(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHeader}>
              <Text style={{ fontFamily: fonts.heading, fontSize: 19, color: colors.foreground }}>
                Your sizes
              </Text>
              <IconButton icon="x" onPress={() => setShowSizes(false)} testID="close-sizes" />
            </View>
            {sizeQuery.isLoading ? (
              <Text style={{ fontFamily: fonts.body, color: colors.mutedForeground, padding: 20 }}>
                Loading…
              </Text>
            ) : sizeQuery.isError ? (
              <Button label="Retry" variant="secondary" onPress={() => sizeQuery.refetch()} />
            ) : (
              (sizeQuery.data ?? []).map((rec) => (
                <View
                  key={rec.category}
                  style={[styles.sizeRow, { borderColor: colors.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.foreground, textTransform: 'capitalize' }}>
                      {rec.category}
                    </Text>
                    <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                      {rec.fitNote ?? rec.basis}
                    </Text>
                  </View>
                  <View style={[styles.sizeBadge, { backgroundColor: colors.primary }]}>
                    <Text style={{ fontFamily: fonts.heading, fontSize: 16, color: colors.primaryForeground }}>
                      {rec.recommendedSize}
                    </Text>
                  </View>
                  {rec.secondarySize ? (
                    <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.mutedForeground, marginLeft: 8 }}>
                      {rec.secondarySize}
                    </Text>
                  ) : null}
                </View>
              ))
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  headerKicker: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 2.5 },
  headerTitle: { fontFamily: fonts.heading, fontSize: 19 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  previewCard: {
    flex: 1,
    marginLeft: 20,
    marginRight: 12,
    marginBottom: 12,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    alignItems: 'stretch',
  },
  face: { width: 96, height: 96, borderRadius: 48, alignSelf: 'center' },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  slotSwatch: { width: 16, height: 16, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
  rail: { gap: 10, paddingRight: 20, paddingBottom: 12, justifyContent: 'center' },
  railButton: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  bottomPanel: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14 },
  itemCard: {
    minWidth: 120,
    maxWidth: 160,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  miniSwatch: { width: 12, height: 12, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth },
  colorSwatch: { width: 34, height: 34, borderRadius: 17 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(19,17,24,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sizeBadge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
});
