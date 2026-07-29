import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type Href, useRouter } from 'expo-router';
import { useSignIn } from '@clerk/expo';
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
import { fonts } from '@/constants/colors';

export default function SignInScreen() {
  const colors = useColors();
  const insets = useScreenInsets();
  const router = useRouter();
  const { signIn, errors, fetchStatus } = useSignIn();
  const onGoogle = useGoogleSSO();

  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  // Errors surfaced from the async flow (verification / finalize / global) that
  // don't map to a single input field.
  const [formError, setFormError] = useState<string | null>(null);

  // Convert a sign-in that has reached `status === 'complete'` into an active
  // session. Navigation is handled by Clerk's `navigate` callback.
  const finalize = async () => {
    const { error } = await signIn.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) {
          console.log(session?.currentTask);
          return;
        }
        const url = decorateUrl('/');
        router.replace(url as Href);
      },
    });
    if (error) {
      setFormError(error.longMessage || error.message);
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    setFormError(null);
    const { error } = await signIn.password({ emailAddress, password });
    if (error) {
      // Field-level errors render inline via `errors.fields`; surface anything
      // else (e.g. account-level failures) so the user isn't left staring.
      setFormError(error.longMessage || error.message);
      return;
    }
    // From here the reactive `signIn.status` drives the UI:
    //   - `complete`            -> finalize below
    //   - `needs_client_trust`  -> the verify screen renders and an effect
    //                              sends the email code automatically
    //   - `needs_second_factor` -> the verify screen renders (code already sent)
    if (signIn.status === 'complete') {
      await finalize();
    }
  };

  // A new-device sign-in lands in `needs_client_trust`; establishing client
  // trust uses the email-code SECOND factor. Send the code once on entry.
  const codeRequestedRef = useRef(false);
  const needsCode =
    signIn.status === 'needs_client_trust' ||
    signIn.status === 'needs_second_factor';

  useEffect(() => {
    if (!needsCode || codeRequestedRef.current) return;
    const emailCodeFactor = signIn.supportedSecondFactors?.find(
      (factor) => factor.strategy === 'email_code',
    );
    if (!emailCodeFactor) return;
    codeRequestedRef.current = true;
    signIn.mfa.sendEmailCode().then(({ error }) => {
      if (error) {
        codeRequestedRef.current = false;
        setFormError(error.longMessage || error.message);
      }
    });
  }, [needsCode, signIn]);

  const resendCode = async () => {
    setFormError(null);
    const { error } = await signIn.mfa.sendEmailCode();
    if (error) setFormError(error.longMessage || error.message);
  };

  const handleVerify = async () => {
    setFormError(null);
    // Establish client trust / complete MFA with the email code. Do NOT gate the
    // follow-up on the closure's `signIn.status` (stale within this callback) —
    // drive off the returned error and finalize on success instead.
    const { error } = await signIn.mfa.verifyEmailCode({ code });
    if (error) {
      setFormError(error.longMessage || error.message);
      return;
    }
    await finalize();
  };

  const busy = fetchStatus === 'fetching';

  if (needsCode) {
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
            title="Verify your account"
            subtitle="Enter the code we emailed you to finish signing in."
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
          {formError ? (
            <Text
              testID="verify-error"
              style={[styles.formError, { color: colors.destructive }]}
            >
              {formError}
            </Text>
          ) : null}
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
            onPress={resendCode}
          />
          <Button
            label="Start over"
            variant="ghost"
            onPress={() => {
              codeRequestedRef.current = false;
              setFormError(null);
              signIn.reset();
            }}
          />
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
          title="Welcome back"
          subtitle="Sign in to pick up your looks where you left off."
        />

        <SocialButton
          testID="google-signin"
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
          error={errors.fields.identifier?.message}
        />
        <AuthField
          label="Password"
          testID="password"
          value={password}
          onChangeText={setPassword}
          placeholder="Enter password"
          secureTextEntry
          error={errors.fields.password?.message}
        />

        {formError ? (
          <Text
            testID="form-error"
            style={[styles.formError, { color: colors.destructive }]}
          >
            {formError}
          </Text>
        ) : null}

        <Button
          testID="submit"
          label="Continue"
          loading={busy}
          disabled={!emailAddress || !password || busy}
          onPress={handleSubmit}
        />

        <AuthFooterLink
          prompt="Don't have an account?"
          action="Create account"
          testID="go-signup"
          onPress={() => router.replace('/sign-up' as Href)}
        />
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { paddingHorizontal: 20, paddingVertical: 12 },
  content: { paddingHorizontal: 24, gap: 16, flexGrow: 1 },
  formError: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
});
