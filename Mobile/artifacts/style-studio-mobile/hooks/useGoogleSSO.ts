import { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { useSSO } from '@clerk/expo';
import { useRouter } from 'expo-router';

// Preloads the browser for Android devices to reduce authentication load time.
// See: https://docs.expo.dev/guides/authentication/#improving-user-experience
export function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
}

// Handle any pending authentication sessions.
WebBrowser.maybeCompleteAuthSession();

/**
 * Google OAuth flow shared by sign-in and sign-up. `startSSOFlow` both signs up
 * and signs in, so the same handler works on either screen.
 */
export function useGoogleSSO() {
  useWarmUpBrowser();
  const { startSSOFlow } = useSSO();
  const router = useRouter();

  return useCallback(async () => {
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: AuthSession.makeRedirectUri(),
      });

      if (createdSessionId && setActive) {
        await setActive({
          session: createdSessionId,
          navigate: async ({ session }) => {
            if (session?.currentTask) {
              console.log(session?.currentTask);
              return;
            }
            router.replace('/');
          },
        });
      } else {
        // No `createdSessionId` means there are missing requirements (e.g. MFA).
        // See Clerk's OAuth custom-flow docs for handling those cases.
      }
    } catch (err) {
      console.error(JSON.stringify(err, null, 2));
    }
  }, [startSSOFlow, router]);
}
