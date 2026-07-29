import { useParams } from 'wouter';
import { motion } from 'framer-motion';
import { Scissors, Shirt, Star, Ruler, Eye, LucideIcon } from 'lucide-react';
import { useGetSharedLook, getGetSharedLookQueryKey } from '@workspace/api-client-react';
import { snapshotSrc } from '@/lib/snapshot';

const SLOT_ICONS: Record<string, LucideIcon> = {
  hairstyle: Scissors,
  beard: Star,
  shirt: Shirt,
  pants: Scissors,
  shoes: Star,
};

export default function Share() {
  const { token } = useParams();
  const { data: look, isLoading, isError } = useGetSharedLook(token ?? '', {
    query: { enabled: !!token, queryKey: getGetSharedLookQueryKey(token ?? ''), retry: false },
  });

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex bg-background items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !look) {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-background items-center justify-center p-6 text-center">
        <Eye className="w-12 h-12 text-muted-foreground mb-4 opacity-40" />
        <h1 className="text-2xl font-bold mb-2">Look not found</h1>
        <p className="text-muted-foreground">This share link is invalid or the look was deleted.</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground relative overflow-x-hidden">
      {/* Decorative Background */}
      <div className="fixed top-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-accent/10 rounded-full blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-2xl mx-auto p-6 md:py-12 z-10 relative"
      >
        <div className="text-center mb-8">
          <p className="text-sm uppercase tracking-widest text-muted-foreground mb-2">Shared Look</p>
          <h1 className="text-4xl font-bold tracking-tight" data-testid="text-look-name">{look.name}</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Saved {new Date(look.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} · Style Studio
          </p>
        </div>

        {/* Snapshot */}
        <div className="rounded-3xl overflow-hidden border border-border shadow-xl bg-card mb-8">
          {look.snapshotDataUrl ? (
            <img
              src={snapshotSrc(look.snapshotDataUrl)}
              alt={look.name}
              className="w-full aspect-square object-cover"
              data-testid="img-snapshot"
            />
          ) : (
            <div className="w-full aspect-square bg-secondary flex flex-col items-center justify-center text-muted-foreground">
              <Eye className="w-10 h-10 mb-2 opacity-40" />
              <span>No snapshot available</span>
            </div>
          )}
        </div>

        {/* Items */}
        <div className="bg-card rounded-3xl border border-border shadow-lg p-6 mb-8">
          <h2 className="font-bold font-serif text-lg mb-4">What's in this look</h2>
          {look.items.length === 0 ? (
            <p className="text-muted-foreground text-sm">No items selected in this look.</p>
          ) : (
            <div className="space-y-3">
              {look.items.map(item => {
                const Icon = SLOT_ICONS[item.slot] || Star;
                return (
                  <div
                    key={item.slot}
                    className="flex items-center gap-4 bg-secondary/50 rounded-2xl p-4"
                    data-testid={`item-${item.slot}`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-background flex items-center justify-center border border-border shrink-0">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">{item.slot}</div>
                      <div className="font-semibold truncate">{item.name}</div>
                      {item.description && (
                        <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                      )}
                    </div>
                    {item.color && (
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className="w-6 h-6 rounded-full border border-black/10"
                          style={{ backgroundColor: item.color }}
                          title={item.color}
                        />
                        <span className="text-xs text-muted-foreground font-mono">{item.color}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Size Recommendations */}
        {look.sizeRecommendations.length > 0 && (
          <div className="bg-card rounded-3xl border border-border shadow-lg p-6">
            <h2 className="font-bold font-serif text-lg mb-4 flex items-center gap-2">
              <Ruler className="w-5 h-5 text-primary" /> Size Recommendations
            </h2>
            <div className="space-y-4">
              {look.sizeRecommendations.map(rec => (
                <div key={rec.category} className="bg-secondary/50 rounded-2xl p-4" data-testid={`size-${rec.category}`}>
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-semibold capitalize">{rec.category}</span>
                    <span className="text-xl font-bold text-primary">{rec.recommendedSize}</span>
                  </div>
                  {rec.secondarySize && (
                    <div className="text-sm text-muted-foreground mb-1">Alt: {rec.secondarySize}</div>
                  )}
                  <div className="text-xs text-muted-foreground opacity-80">{rec.basis}</div>
                  {rec.fitNote && (
                    <div className="mt-2 text-xs bg-accent/10 text-accent p-2 rounded-lg">{rec.fitNote}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-10">
          Made with Style Studio — your personal virtual dressing room.
        </p>
      </motion.div>
    </div>
  );
}
