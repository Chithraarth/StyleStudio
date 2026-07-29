import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';

import Home from '@/pages/home';
import Hub from '@/pages/hub';
import NewAvatar from '@/pages/new-avatar';
import Studio from '@/pages/studio';
import Share from '@/pages/share';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

// No auth provider is wired up right now (Clerk was removed; Firebase is a
// planned follow-up) — every route is reachable directly, and the backend
// resolves every request to a single auto-provisioned default user (see
// backend/artifacts/api-server/src/middlewares/auth.ts).
function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/hub" component={Hub} />
      <Route path="/new-avatar" component={NewAvatar} />
      <Route path="/studio/:avatarId" component={Studio} />
      <Route path="/share/:token" component={Share} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </WouterRouter>
  );
}

export default App;
