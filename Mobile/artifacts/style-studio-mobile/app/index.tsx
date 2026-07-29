import React from 'react';
import { Redirect } from 'expo-router';
import {
  useGetCurrentUser,
  getGetCurrentUserQueryKey,
} from '@workspace/api-client-react';
import { LoadingView } from '@/components/ui';

// No auth provider is wired up right now (Clerk was removed; Firebase is a
// planned follow-up) — the backend resolves every request to a single
// auto-provisioned default user, so this screen just fetches that profile
// and goes straight into their hub.
export default function Welcome() {
  const meQuery = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey() },
  });

  if (meQuery.isLoading) return <LoadingView />;
  if (meQuery.data) return <Redirect href={`/user/${meQuery.data.id}`} />;

  return <LoadingView />;
}
