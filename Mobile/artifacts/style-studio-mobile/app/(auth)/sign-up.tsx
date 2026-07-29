import React, { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { type Href, useRouter } from 'expo-router';
import { useAuth, useSignUp } from '@clerk/expo';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useGoogleSSO } from '@/hooks/useGoogleSSO';
import { Button, IconButton, useScreenInsets } from '@/components/ui';
import {
  AuthDivider,
  AuthField,
  AuthFooterLink,
  AuthHeader,
  SocialButton,
} from '@/components/auth-ui';

export default function SignUpScreen() {
  const colors = useColors();
  const insets = useScreenInsets();
  const router = useRouter();
  const { signUp, errors, fetchStatus } = useSignUp();
  const { isSignedIn } = useAuth();
  const onGoogle = useGoogleSSO();

  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  const handleSubmit = async () => {
    const { error } = await signUp.password({ emailAddress, password });
    if (error) {
      console.error(JSON.stringify(error, null, 2));
      return;
    }
    await signUp.verifications.sendEmailCode();
  };

  const handleVerify = async () => {
    await signUp.verifications.verifyEmailCode({ code });
    if (signUp.status === 'complete') {
      await signUp.finalize({
        navigate: ({ session, decorateUrl }) => {
          if (session?.currentTask) {
            console.log(session?.currentTask);
            return;
          }
          const url = decorateUrl('/');
          router.replace(url as Href);
        },
      });
    } else {
      console.error('Sign-up attempt not complete:', signUp);
    }
  };

  const busy = fetchStatus === 'fetching';

  if (signUp.status === 'complete' || isSignedIn) {
    return null;
  }

  const needsVerification =
    signUp.status === 'missing_requirements' &&
    signUp.unverifiedFields.includes('email_address') &&
    signUp.missingFields.length === 0;

  if (needsVerification) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background, paddingTop: insets.top },
        ]}
      >
        <View style={styles.headerRow}>
          <IconButton
            icon="arrow-left"
            testID="auth-back"
            onPress={() => router.back()}
          />
        </View>
        <KeyboardAwareScrollViewCompat
          bottomOffset={80}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 24 },
          ]}
        >
          <AuthHeader
            title="Verify your email"
            subtitle={`We sent a code to ${emailAddress || 'your inbox'}. Enter it below to finish.`}
          />
          <AuthField
            label="Verification code"
            testID="verify-code"
            value={code}
            onChangeText={setCode}
            placeholder="123456"
            keyboardType="number-pad"
            error={errors.fields.code?.message}
          />
          <Button
            testID="verify-submit"
            label="Verify"
            loading={busy}
            disabled={busy || !code}
            onPress={handleVerify}
          />
          <Button
            label="I need a new code"
            variant="ghost"
            onPress={() => signUp.verifications.sendEmailCode()}
          />
          {/* Required for sign-up flows. Clerk's bot protection is enabled by default. */}
          <View nativeID="clerk-captcha" />
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top },
      ]}
    >
      <View style={styles.headerRow}>
        <IconButton
          icon="arrow-left"
          testID="auth-back"
          onPress={() => router.back()}
        />
      </View>
      <KeyboardAwareScrollViewCompat
        bottomOffset={80}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 24 },
        ]}
      >
        <AuthHeader
          title="Create your account"
          subtitle="Start styling your avatar in a couple of taps."
        />

        <SocialButton
          testID="google-signup"
          label="Continue with Google"
          icon="chrome"
          onPress={onGoogle}
        />

        <AuthDivider label="or" />

        <AuthField
          label="Email address"
          testID="email"
          autoCapitalize="none"
          autoComplete="email"
          value={emailAddress}
          onChangeText={setEmailAddress}
          placeholder="you@example.com"
          keyboardType="email-address"
          error={errors.fields.emailAddress?.message}
        />
        <AuthField
          label="Password"
          testID="password"
          value={password}
          onChangeText={setPassword}
          placeholder="Create a password"
          secureTextEntry
          error={errors.fields.password?.message}
        />

        <Button
          testID="submit"
          label="Create account"
          loading={busy}
          disabled={!emailAddress || !password || busy}
          onPress={handleSubmit}
        />

        <AuthFooterLink
          prompt="Already have an account?"
          action="Sign in"
          testID="go-signin"
          onPress={() => router.replace('/sign-in' as Href)}
        />

        {/* Required for sign-up flows. Clerk's bot protection is enabled by default. */}
        <View nativeID="clerk-captcha" style={Platform.OS === 'web' ? undefined : styles.captcha} />
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { paddingHorizontal: 20, paddingVertical: 12 },
  content: { paddingHorizontal: 24, gap: 16, flexGrow: 1 },
  captcha: { height: 0 },
});
