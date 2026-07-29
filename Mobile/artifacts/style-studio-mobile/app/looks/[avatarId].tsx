import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetAvatar,
  useListLooks,
  useListCatalogItems,
  useDeleteLook,
  useUpdateLook,
  useShareLook,
  useUnshareLook,
  getListLooksQueryKey,
  getGetUserSummaryQueryKey,
  type Look,
  type CatalogItem,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

// New snapshots are stored in object storage as "/objects/..." paths served
// via the API; legacy snapshots are base64 data URLs usable as-is.
const snapshotUri = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  if (value.startsWith('/objects/')) {
    return `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/storage${value}`;
  }
  return value;
};
import { fonts } from '@/constants/colors';
import {
  Button,
  EmptyState,
  ErrorView,
  IconButton,
  LoadingView,
  useScreenInsets,
} from '@/components/ui';

const SLOTS: {
  idKey: 'hairstyleItemId' | 'beardItemId' | 'shirtItemId' | 'pantsItemId' | 'shoesItemId';
  colorKey: 'hairstyleColor' | 'beardColor' | 'shirtColor' | 'pantsColor' | 'shoesColor';
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}[] = [
  { idKey: 'hairstyleItemId', colorKey: 'hairstyleColor', icon: 'content-cut' },
  { idKey: 'beardItemId', colorKey: 'beardColor', icon: 'mustache' },
  { idKey: 'shirtItemId', colorKey: 'shirtColor', icon: 'tshirt-crew' },
  { idKey: 'pantsItemId', colorKey: 'pantsColor', icon: 'human-male' },
  { idKey: 'shoesItemId', colorKey: 'shoesColor', icon: 'shoe-sneaker' },
];

export default function LooksGallery() {
  const { avatarId } = useLocalSearchParams<{ avatarId: string }>();
  const id = Number(avatarId);
  const colors = useColors();
  const insets = useScreenInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const avatarQuery = useGetAvatar(id);
  const looksQuery = useListLooks(id);
  const catalogQuery = useListCatalogItems();

  const itemById = useMemo(() => {
    const map = new Map<number, CatalogItem>();
    for (const item of catalogQuery.data ?? []) map.set(item.id, item);
    return map;
  }, [catalogQuery.data]);

  const [renameTarget, setRenameTarget] = useState<Look | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Look | null>(null);

  const updateLook = useUpdateLook({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLooksQueryKey(id) });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setRenameTarget(null);
      },
      onError: () => {
        Alert.alert('Rename failed', "Couldn't rename this look. Try again.");
      },
    },
  });

  const startRename = (look: Look) => {
    setRenameValue(look.name);
    setRenameTarget(look);
  };

  const submitRename = () => {
    const name = renameValue.trim();
    if (!renameTarget) return;
    if (!name || name === renameTarget.name) {
      setRenameTarget(null);
      return;
    }
    updateLook.mutate({ lookId: renameTarget.id, data: { name } });
  };

  const deleteLook = useDeleteLook({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLooksQueryKey(id) });
        if (avatarQuery.data) {
          queryClient.invalidateQueries({
            queryKey: getGetUserSummaryQueryKey(avatarQuery.data.userId),
          });
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setDeleteTarget(null);
      },
      onError: () => {
        Alert.alert('Delete failed', "Couldn't delete this look. Try again.");
      },
    },
  });

  const shareLook = useShareLook({
    mutation: {
      onSuccess: async ({ shareToken }) => {
        queryClient.invalidateQueries({ queryKey: getListLooksQueryKey(id) });
        const url = `https://${process.env.EXPO_PUBLIC_DOMAIN}/share/${shareToken}`;
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          try {
            await Share.share(
              Platform.OS === 'ios'
                ? { url, message: 'Check out my look on Style Studio' }
                : { message: url },
            );
            return;
          } catch {
            // fall through to clipboard fallback
          }
        }
        try {
          await Clipboard.setStringAsync(url);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert('Share link copied!', 'Anyone with the link can view this look — no login needed.');
        } catch {
          Alert.alert('Share link ready', url);
        }
      },
      onError: () => {
        Alert.alert('Could not create share link', 'Please try again.');
      },
    },
  });

  const unshareLook = useUnshareLook({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLooksQueryKey(id) });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
      onError: () => {
        Alert.alert('Could not turn off share link', 'Please try again.');
      },
    },
  });

  const confirmUnshare = (look: Look) => {
    if (Platform.OS === 'web') {
      unshareLook.mutate({ lookId: look.id });
      return;
    }
    Alert.alert(
      'Turn off share link?',
      `The link for "${look.name}" will stop working. You can share again anytime to get a fresh link.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Turn off',
          style: 'destructive',
          onPress: () => unshareLook.mutate({ lookId: look.id }),
        },
      ],
    );
  };

  const confirmDelete = (look: Look) => {
    if (Platform.OS === 'web') {
      setDeleteTarget(look);
      return;
    }
    Alert.alert('Delete look?', `"${look.name}" will be gone for good.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteLook.mutate({ lookId: look.id }),
      },
    ]);
  };

  if (looksQuery.isLoading || catalogQuery.isLoading) return <LoadingView />;
  if (looksQuery.isError) {
    return <ErrorView onRetry={() => looksQuery.refetch()} />;
  }

  const renderLook = ({ item: look }: { item: Look }) => (
    <View style={[styles.lookCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {look.snapshotDataUrl ? (
          <Image source={{ uri: snapshotUri(look.snapshotDataUrl) }} style={styles.snapshot} contentFit="cover" />
        ) : avatarQuery.data?.facePhotoUrl ? (
          <Image source={{ uri: avatarQuery.data.facePhotoUrl }} style={styles.snapshot} contentFit="cover" />
        ) : (
          <View style={[styles.snapshot, { backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' }]}>
            <MaterialCommunityIcons name="hanger" size={22} color={colors.mutedForeground} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.headingSemi, fontSize: 16, color: colors.foreground }} numberOfLines={1}>
            {look.name}
          </Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
            {new Date(look.createdAt).toLocaleDateString()}
          </Text>
        </View>
        <IconButton
          icon="edit-2"
          size={17}
          color={colors.mutedForeground}
          onPress={() => startRename(look)}
          testID={`rename-look-${look.id}`}
        />
        <IconButton
          icon="share-2"
          size={17}
          color={colors.foreground}
          onPress={() => shareLook.mutate({ lookId: look.id })}
          testID={`share-look-${look.id}`}
        />
        {look.shareToken ? (
          <IconButton
            icon="link-2"
            size={17}
            color={colors.mutedForeground}
            onPress={() => confirmUnshare(look)}
            testID={`unshare-look-${look.id}`}
          />
        ) : null}
        <IconButton
          icon="trash-2"
          size={17}
          color={colors.destructive}
          onPress={() => confirmDelete(look)}
          testID={`delete-look-${look.id}`}
        />
      </View>

      <View style={styles.pieceRow}>
        {SLOTS.map((slot) => {
          const itemId = look.selections[slot.idKey];
          if (itemId == null) return null;
          const catalogItem = itemById.get(itemId);
          const color = look.selections[slot.colorKey];
          return (
            <View key={slot.idKey} style={[styles.pieceChip, { backgroundColor: colors.secondary }]}>
              <MaterialCommunityIcons name={slot.icon} size={13} color={colors.foreground} />
              <Text numberOfLines={1} style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.foreground, maxWidth: 110 }}>
                {catalogItem?.name ?? `#${itemId}`}
              </Text>
              {color ? (
                <View style={[styles.pieceSwatch, { backgroundColor: color, borderColor: colors.border }]} />
              ) : null}
            </View>
          );
        })}
      </View>

      <Button
        testID={`apply-look-${look.id}`}
        label="Try on"
        icon="refresh-ccw"
        variant="secondary"
        onPress={() =>
          router.replace({
            pathname: '/studio/[avatarId]',
            params: { avatarId: String(id), applyLookId: String(look.id) },
          })
        }
      />
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <IconButton icon="arrow-left" onPress={() => router.back()} testID="looks-back" />
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: colors.accent }]}>SAVED LOOKS</Text>
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
            {avatarQuery.data?.name ?? 'Looks'}
          </Text>
        </View>
      </View>

      <FlatList
        data={looksQuery.data ?? []}
        keyExtractor={(l) => String(l.id)}
        renderItem={renderLook}
        scrollEnabled={(looksQuery.data ?? []).length > 0}
        contentContainerStyle={{ padding: 20, gap: 14, flexGrow: 1, paddingBottom: insets.bottom + 20 }}
        ListEmptyComponent={
          <EmptyState
            icon="bookmark"
            title="No saved looks"
            subtitle="Style your avatar in the studio and save a look to show your barber."
          />
        }
      />

      <Modal
        visible={renameTarget != null}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameTarget(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setRenameTarget(null)} />
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ fontFamily: fonts.headingSemi, fontSize: 17, color: colors.foreground }}>
              Rename look
            </Text>
            <TextInput
              testID="rename-look-input"
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Look name"
              placeholderTextColor={colors.mutedForeground}
              autoFocus
              maxLength={80}
              returnKeyType="done"
              onSubmitEditing={submitRename}
              style={[
                styles.modalInput,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                },
              ]}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setRenameTarget(null)}
                  testID="rename-look-cancel"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label={updateLook.isPending ? 'Saving…' : 'Save'}
                  onPress={submitRename}
                  disabled={updateLook.isPending || !renameValue.trim()}
                  testID="rename-look-save"
                />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={deleteTarget != null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setDeleteTarget(null)} />
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ fontFamily: fonts.headingSemi, fontSize: 17, color: colors.foreground }}>
              Delete look?
            </Text>
            <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.mutedForeground }}>
              {`"${deleteTarget?.name ?? ''}" will be gone for good.`}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setDeleteTarget(null)}
                  testID="delete-look-cancel"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label={deleteLook.isPending ? 'Deleting…' : 'Delete'}
                  variant="destructive"
                  onPress={() => deleteTarget && deleteLook.mutate({ lookId: deleteTarget.id })}
                  disabled={deleteLook.isPending}
                  testID="delete-look-confirm"
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  kicker: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 2.5 },
  title: { fontFamily: fonts.heading, fontSize: 21 },
  lookCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 14,
  },
  snapshot: { width: 52, height: 52, borderRadius: 26 },
  pieceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pieceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  pieceSwatch: { width: 12, height: 12, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    gap: 14,
  },
  modalInput: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 15,
  },
});
