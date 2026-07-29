import { Link, useLocation, Redirect } from 'wouter';
import { motion } from 'framer-motion';
import { Plus, UserCircle, History, Camera, Eye, Trash2 } from 'lucide-react';
import {
  useGetCurrentUser,
  useGetUserSummary,
  useListAvatars,
  useDeleteAvatar,
  getGetUserSummaryQueryKey,
  getListAvatarsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Navbar } from '@/components/layout/Navbar';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

export default function Hub() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: user, isLoading: isLoadingUser, error: userError } = useGetCurrentUser();
  const id = user?.id ?? 0;

  const { data: summary, isLoading: isLoadingSummary } = useGetUserSummary(id, { query: { enabled: !!id, queryKey: getGetUserSummaryQueryKey(id) } });
  const { data: avatars, isLoading: isLoadingAvatars } = useListAvatars(id, { query: { enabled: !!id, queryKey: getListAvatarsQueryKey(id) } });
  const deleteAvatar = useDeleteAvatar();

  // If the current-user query fails with 401, the session is gone — go home.
  if (userError && (userError as { status?: number }).status === 401) {
    return <Redirect to="/" />;
  }

  const handleDeleteAvatar = (avatarId: number) => {
    if (confirm('Are you sure you want to delete this avatar?')) {
      deleteAvatar.mutate({ avatarId }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAvatarsQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getGetUserSummaryQueryKey(id) });
        }
      });
    }
  };

  if (isLoadingUser || isLoadingSummary || isLoadingAvatars) {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-background">
        <Navbar title="Loading..." />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-6 text-center">
          <div>
            <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
            <Link href="/" className="text-primary hover:underline">Return home</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <Navbar title={`Hello, ${user.name}`} />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <div className="bg-card p-6 rounded-3xl border border-card-border shadow-sm flex flex-col items-center text-center">
            <UserCircle className="w-8 h-8 text-primary mb-3" />
            <span className="text-3xl font-bold font-serif mb-1">{summary?.avatarCount || 0}</span>
            <span className="text-sm text-muted-foreground uppercase tracking-wider font-medium">Avatars</span>
          </div>
          <div className="bg-card p-6 rounded-3xl border border-card-border shadow-sm flex flex-col items-center text-center">
            <Camera className="w-8 h-8 text-accent mb-3" />
            <span className="text-3xl font-bold font-serif mb-1">{summary?.lookCount || 0}</span>
            <span className="text-sm text-muted-foreground uppercase tracking-wider font-medium">Saved Looks</span>
          </div>
          <div className="bg-card p-6 rounded-3xl border border-card-border shadow-sm flex flex-col items-center justify-center text-center col-span-2 md:col-span-2">
            {summary?.latestLookName ? (
              <>
                <History className="w-6 h-6 text-muted-foreground mb-2" />
                <span className="text-sm text-muted-foreground mb-1">Latest Style</span>
                <span className="font-semibold text-lg truncate w-full px-4">{summary.latestLookName}</span>
                <span className="text-xs text-muted-foreground mt-1">
                  {summary.latestLookAt && format(new Date(summary.latestLookAt), "MMM d, yyyy")}
                </span>
              </>
            ) : (
              <div className="text-muted-foreground flex flex-col items-center">
                <History className="w-8 h-8 mb-2 opacity-50" />
                <span>No looks saved yet</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold font-serif">Your Avatars</h2>
        </div>

        {avatars?.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-dashed border-border rounded-3xl p-12 text-center flex flex-col items-center"
          >
            <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mb-6">
              <UserCircle className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No avatars yet</h3>
            <p className="text-muted-foreground mb-8 max-w-sm">
              Create your first virtual avatar to start trying on clothes and exploring styles.
            </p>
            <Button size="lg" className="rounded-2xl h-14 px-8 text-lg" onClick={() => setLocation('/new-avatar')}>
              <Plus className="w-5 h-5 mr-2" />
              Create Avatar
            </Button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Create New Card */}
            <button
              onClick={() => setLocation('/new-avatar')}
              className="group h-[280px] bg-secondary/30 hover:bg-secondary/60 border-2 border-dashed border-border hover:border-primary/50 rounded-3xl flex flex-col items-center justify-center transition-all"
            >
              <div className="w-16 h-16 bg-background shadow-sm rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Plus className="w-8 h-8 text-primary" />
              </div>
              <span className="font-medium text-lg text-foreground">Create New Avatar</span>
            </button>

            {/* Avatar Cards */}
            {avatars?.map((avatar, index) => (
              <motion.div
                key={avatar.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="group relative h-[280px] bg-card border border-card-border rounded-3xl p-6 flex flex-col justify-between overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                {avatar.facePhotoUrl && (
                  <div
                    className="absolute inset-0 opacity-10 grayscale group-hover:grayscale-0 group-hover:opacity-20 transition-all duration-500 bg-cover bg-center"
                    style={{ backgroundImage: `url(${avatar.facePhotoUrl})` }}
                  />
                )}
                <div className="relative z-10 flex justify-between items-start">
                  <div>
                    <h3 className="text-2xl font-bold font-serif mb-1">{avatar.name}</h3>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground uppercase tracking-wider">
                      {avatar.bodyType}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 -mt-2 -mr-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteAvatar(avatar.id);
                    }}
                  >
                    <Trash2 className="w-5 h-5" />
                  </Button>
                </div>

                <div className="relative z-10 grid grid-cols-2 gap-2 text-sm text-muted-foreground mb-4">
                  <div className="flex flex-col">
                    <span className="text-xs uppercase tracking-wider opacity-70">Height</span>
                    <span className="font-medium text-foreground">{avatar.heightCm} cm</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs uppercase tracking-wider opacity-70">Weight</span>
                    <span className="font-medium text-foreground">{avatar.weightKg} kg</span>
                  </div>
                </div>

                <Button
                  className="relative z-10 w-full rounded-xl h-12"
                  onClick={() => setLocation(`/studio/${avatar.id}`)}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Enter Studio
                </Button>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
