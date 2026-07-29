import { useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Redirect, useLocation, Router as WouterRouter } from 'wouter';

import Home from '@/pages/home';
import Hub from '@/pages/hub';
import NewAvatar from '@/pages/new-avatar';
import Studio from '@/pages/studio';
import Share from '@/pages/share';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

// REQUIRED — copy verbatim. Resolves the key from window.location.hostname so the
// same build serves multiple Clerk custom domains.
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// REQUIRED — copy verbatim. Empty in dev, auto-set in prod.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

// Clerk passes full paths to routerPush/routerReplace, but wouter's
// setLocation prepends the base — strip it to avoid doubling.
function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsPlacement: 'top' as const,
    socialButtonsVariant: 'blockButton' as const,
  },
  variables: {
    colorPrimary: 'hsl(250 80% 51%)',
    colorForeground: 'hsl(260 10% 8%)',
    colorMutedForeground: 'hsl(260 5% 45%)',
    colorDanger: 'hsl(0 84% 60%)',
    colorBackground: 'hsl(0 0% 100%)',
    colorInput: 'hsl(40 20% 96%)',
    colorInputForeground: 'hsl(260 10% 8%)',
    colorNeutral: 'hsl(40 10% 85%)',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    borderRadius: '1rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-white rounded-3xl w-[440px] max-w-full overflow-hidden shadow-xl border border-[hsl(40_10%_85%)]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    main: 'gap-4',
    headerTitle: 'text-[hsl(260_10%_8%)] text-2xl font-bold [font-family:Syne,sans-serif]',
    headerSubtitle: 'text-[hsl(260_5%_45%)] text-sm',
    socialButtonsBlockButton: 'border border-[hsl(40_10%_85%)] bg-[hsl(40_20%_92%)] rounded-xl h-11',
    socialButtonsBlockButtonText: 'text-[hsl(260_10%_8%)] font-medium',
    dividerLine: 'bg-[hsl(40_10%_85%)]',
    dividerText: 'text-[hsl(260_5%_45%)]',
    formFieldLabel: 'text-[hsl(260_10%_8%)] font-medium',
    formFieldInput: 'bg-[hsl(40_20%_96%)] text-[hsl(260_10%_8%)] border border-[hsl(40_10%_85%)] rounded-xl h-11',
    formFieldRow: 'gap-2',
    formButtonPrimary: 'bg-[hsl(250_80%_51%)] text-white rounded-xl h-11 font-semibold normal-case',
    footerAction: 'text-center',
    footerActionText: 'text-[hsl(260_5%_45%)]',
    footerActionLink: 'text-[hsl(250_80%_51%)] font-semibold',
    identityPreviewEditButton: 'text-[hsl(250_80%_51%)]',
    formFieldSuccessText: 'text-[hsl(160_60%_35%)]',
    alert: 'bg-[hsl(0_84%_60%/0.1)] border border-[hsl(0_84%_60%/0.3)] rounded-xl',
    alertText: 'text-[hsl(0_84%_45%)]',
    otpCodeFieldInput: 'bg-[hsl(40_20%_96%)] text-[hsl(260_10%_8%)] border border-[hsl(40_10%_85%)] rounded-xl',
    logoBox: 'h-10 justify-center',
    logoImage: 'h-9 w-auto',
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 relative overflow-hidden">
      <div className="fixed top-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-accent/10 rounded-full blur-[100px] pointer-events-none" />
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 relative overflow-hidden">
      <div className="fixed top-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-accent/10 rounded-full blur-[100px] pointer-events-none" />
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

// Helps the webview stay up-to-date when the signed-in user changes by
// invalidating the QueryClient cache.
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/hub" />
      </Show>
      <Show when="signed-out">
        <Home />
      </Show>
    </>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/hub" component={Hub} />
      <Route path="/new-avatar" component={NewAvatar} />
      <Route path="/studio/:avatarId" component={Studio} />
      <Route path="/share/:token" component={Share} />
      <Route component={NotFound} />
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: 'Welcome back',
            subtitle: 'Sign in to your Style Studio',
          },
        },
        signUp: {
          start: {
            title: 'Create your account',
            subtitle: 'Start your virtual dressing room',
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
