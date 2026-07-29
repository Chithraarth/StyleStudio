import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { fonts } from '@/constants/colors';

export function AuthHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.header}>
      <Text style={[styles.kicker, { color: colors.accent }]}>STYLE STUDIO</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        {subtitle}
      </Text>
    </View>
  );
}

export function AuthField({
  label,
  error,
  style,
  ...inputProps
}: {
  label: string;
  error?: string | null;
} & TextInputProps) {
  const colors = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <TextInput
        placeholderTextColor={colors.mutedForeground}
        style={[
          styles.input,
          {
            color: colors.foreground,
            borderColor: error ? colors.destructive : colors.input,
            backgroundColor: colors.card,
            fontFamily: fonts.bodyMedium,
          },
          style,
        ]}
        {...inputProps}
      />
      {error ? (
        <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
      ) : null}
    </View>
  );
}

export function AuthDivider({ label }: { label: string }) {
  const colors = useColors();
  return (
    <View style={styles.dividerRow}>
      <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
      <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
    </View>
  );
}

export function SocialButton({
  label,
  icon,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        styles.social,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <Feather name={icon} size={18} color={colors.foreground} />
      <Text style={[styles.socialLabel, { color: colors.foreground }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function AuthFooterLink({
  prompt,
  action,
  onPress,
  testID,
}: {
  prompt: string;
  action: string;
  onPress: () => void;
  testID?: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.footer}>
      <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
        {prompt}{' '}
      </Text>
      <Pressable testID={testID} onPress={onPress} hitSlop={8}>
        <Text style={[styles.footerLink, { color: colors.primary }]}>{action}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 10, marginBottom: 4 },
  kicker: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 3 },
  title: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 36 },
  subtitle: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 13 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
  },
  error: { fontFamily: fonts.body, fontSize: 13 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontFamily: fonts.bodyMedium, fontSize: 13 },
  social: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 48,
  },
  socialLabel: { fontFamily: fonts.bodySemi, fontSize: 15 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { fontFamily: fonts.body, fontSize: 14 },
  footerLink: { fontFamily: fonts.bodySemi, fontSize: 14 },
});
