import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { fonts } from '@/constants/colors';

/** Safe insets that also handle the web preview (iframe) edge case. */
export function useScreenInsets() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  return {
    top: isWeb ? Math.max(insets.top, 67) : insets.top,
    bottom: isWeb ? Math.max(insets.bottom, 34) : insets.bottom,
  };
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  style,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  icon?: keyof typeof Feather.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  testID?: string;
}) {
  const colors = useColors();
  const bg =
    variant === 'primary'
      ? colors.primary
      : variant === 'destructive'
        ? colors.destructive
        : variant === 'secondary'
          ? colors.secondary
          : 'transparent';
  const fg =
    variant === 'primary'
      ? colors.primaryForeground
      : variant === 'destructive'
        ? colors.destructiveForeground
        : colors.foreground;
  return (
    <Pressable
      testID={testID}
      disabled={disabled || loading}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          borderRadius: 999,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {icon ? <Feather name={icon} size={17} color={fg} /> : null}
          <Text style={[styles.buttonLabel, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  color,
  size = 20,
  testID,
  active,
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  color?: string;
  size?: number;
  testID?: string;
  active?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.iconButton,
        {
          opacity: pressed ? 0.6 : 1,
          backgroundColor: active ? colors.primary : colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      <Feather
        name={icon}
        size={size}
        color={active ? colors.primaryForeground : (color ?? colors.foreground)}
      />
    </Pressable>
  );
}

export function LoadingView() {
  const colors = useColors();
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function ErrorView({
  message,
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.center}>
      <Feather name="alert-circle" size={32} color={colors.destructive} />
      <Text
        style={{
          fontFamily: fonts.bodyMedium,
          color: colors.foreground,
          fontSize: 15,
          textAlign: 'center',
          marginTop: 10,
          marginBottom: 16,
          paddingHorizontal: 32,
        }}
      >
        {message ?? "Couldn't load. Check your connection."}
      </Text>
      <Button label="Retry" icon="refresh-cw" onPress={onRetry} variant="secondary" />
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.center}>
      <View
        style={[
          styles.emptyIcon,
          { backgroundColor: colors.secondary },
        ]}
      >
        <Feather name={icon} size={26} color={colors.mutedForeground} />
      </View>
      <Text
        style={{
          fontFamily: fonts.headingSemi,
          fontSize: 18,
          color: colors.foreground,
          marginBottom: 6,
        }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={{
            fontFamily: fonts.body,
            fontSize: 14,
            color: colors.mutedForeground,
            textAlign: 'center',
            paddingHorizontal: 40,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 22,
    minHeight: 48,
  },
  buttonLabel: {
    fontFamily: fonts.bodySemi,
    fontSize: 15,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
});
