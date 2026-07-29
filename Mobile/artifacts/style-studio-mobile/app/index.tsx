import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type Href, Redirect, useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import {
  useGetCurrentUser,
  getGetCurrentUserQueryKey,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { fonts } from '@/constants/colors';
import { Button, LoadingView, useScreenInsets } from '@/components/ui';

export default function Welcome() {
  const colors = useColors();
  const insets = useScreenInsets();
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();

  // Signed-in users are routed to their hub, driven by the local profile.
  const meQuery = useGetCurrentUser({
    query: {
      enabled: isLoaded && isSignedIn,
      queryKey: getGetCurrentUserQueryKey(),
    },
  });

  if (!isLoaded) return <LoadingView />;

  if (isSignedIn) {
    if (meQuery.isLoading) return <LoadingView />;
    if (meQuery.data) return <Redirect href={`/user/${meQuery.data.id}`} />;
    // Signed in but profile hasn't resolved yet — keep showing a spinner.
    return <LoadingView />;
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom + 12,
        },
      ]}
    >
      <View style={styles.hero}>
        <Text style={[styles.kicker, { color: colors.accent }]}>STYLE STUDIO</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Your virtual{'\n'}dressing room.
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Build an avatar, try on looks, and walk into the barber with a plan.
        </Text>
      </View>

      <View style={styles.actions}>
        <Button
          testID="sign-in"
          label="Sign in"
          onPress={() => router.push('/sign-in' as Href)}
        />
        <Button
          testID="create-account"
          label="Create account"
          variant="secondary"
          onPress={() => router.push('/sign-up' as Href)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, justifyContent: 'space-between' },
  hero: { flex: 1, justifyContent: 'center', gap: 14 },
  kicker: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 3,
  },
  title: { fontFamily: fonts.heading, fontSize: 40, lineHeight: 46 },
  subtitle: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, maxWidth: 320 },
  actions: { gap: 12 },
});
