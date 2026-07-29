import React from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@clerk/expo';
import {
  useGetUser,
  useGetUserSummary,
  useListAvatars,
  type Avatar,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { fonts } from '@/constants/colors';
import {
  Button,
  EmptyState,
  ErrorView,
  IconButton,
  LoadingView,
  useScreenInsets,
} from '@/components/ui';

export default function UserHub() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const id = Number(userId);
  const colors = useColors();
  const insets = useScreenInsets();
  const router = useRouter();
  const { signOut } = useAuth();

  const userQuery = useGetUser(id);
  const summaryQuery = useGetUserSummary(id);
  const avatarsQuery = useListAvatars(id);

  if (userQuery.isLoading || avatarsQuery.isLoading) return <LoadingView />;
  if (userQuery.isError || avatarsQuery.isError) {
    return (
      <ErrorView
        onRetry={() => {
          userQuery.refetch();
          avatarsQuery.refetch();
        }}
      />
    );
  }

  const summary = summaryQuery.data;

  const renderAvatar = ({ item }: { item: Avatar }) => (
    <Pressable
      testID={`avatar-${item.id}`}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(`/studio/${item.id}`);
      }}
      style={({ pressed }) => [
        styles.avatarCard,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {item.facePhotoUrl ? (
        <Image
          source={{ uri: item.facePhotoUrl }}
          style={styles.avatarPhoto}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.avatarPhoto, { backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' }]}>
          <Feather name="user" size={24} color={colors.mutedForeground} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.avatarName, { color: colors.foreground }]}>{item.name}</Text>
        <Text style={[styles.avatarMeta, { color: colors.mutedForeground }]}>
          {Math.round(item.heightCm)} cm · {Math.round(item.weightKg)} kg
        </Text>
      </View>
      <View style={[styles.studioBadge, { backgroundColor: colors.primary }]}>
        <Feather name="scissors" size={15} color={colors.primaryForeground} />
        <Text style={{ color: colors.primaryForeground, fontFamily: fonts.bodySemi, fontSize: 13 }}>
          Style
        </Text>
      </View>
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <View style={{ width: 42 }} />
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
          {userQuery.data?.name}
        </Text>
        <IconButton
          icon="log-out"
          onPress={() => signOut()}
          testID="sign-out"
        />
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.primary }]}>
            {summary?.avatarCount ?? avatarsQuery.data?.length ?? 0}
          </Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Avatars</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.accent }]}>
            {summary?.lookCount ?? 0}
          </Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Saved looks</Text>
        </View>
      </View>

      {summary?.latestLookName ? (
        <View style={[styles.latestLook, { backgroundColor: colors.secondary }]}>
          <Feather name="bookmark" size={16} color={colors.foreground} />
          <Text
            numberOfLines={1}
            style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.foreground }}
          >
            Latest look: {summary.latestLookName}
          </Text>
        </View>
      ) : null}

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Avatars</Text>
      <FlatList
        data={avatarsQuery.data ?? []}
        keyExtractor={(a) => String(a.id)}
        renderItem={renderAvatar}
        scrollEnabled={(avatarsQuery.data ?? []).length > 0}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 12, flexGrow: 1 }}
        ListEmptyComponent={
          <EmptyState
            icon="camera"
            title="No avatar yet"
            subtitle="Capture your face and measurements to start trying on styles."
          />
        }
      />

      <View style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 12 }}>
        <Button
          testID="new-avatar"
          label="New avatar"
          icon="camera"
          onPress={() => router.push(`/new-avatar/${id}`)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    fontFamily: fonts.heading,
    fontSize: 22,
    textAlign: 'center',
  },
  statsRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginBottom: 12 },
  statCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    alignItems: 'center',
  },
  statValue: { fontFamily: fonts.heading, fontSize: 26 },
  statLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, marginTop: 2 },
  latestLook: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  sectionTitle: {
    fontFamily: fonts.headingSemi,
    fontSize: 16,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  avatarCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  avatarPhoto: { width: 54, height: 54, borderRadius: 27 },
  avatarName: { fontFamily: fonts.bodySemi, fontSize: 16 },
  avatarMeta: { fontFamily: fonts.body, fontSize: 13, marginTop: 2 },
  studioBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
});
