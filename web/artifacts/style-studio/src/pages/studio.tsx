import { useState, useRef, useMemo } from 'react';
import { useParams, Link } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronLeft, Shirt, Scissors, Download, Eye, Save, Plus, X, 
  Ruler, History, Check, Star, Share2, Pencil, Trash2, Link2Off, LucideIcon,
  Smile, ImagePlus, Camera, Glasses, HardHat
} from 'lucide-react';
import { 
  useGetAvatar, 
  useGetSizeProfile, 
  useListCatalogItems, 
  useListLooks,
  useCreateLook,
  useUpdateLook,
  useDeleteLook,
  useShareLook,
  useUnshareLook,
  useRequestUploadUrl,
  getGetAvatarQueryKey,
  getGetSizeProfileQueryKey,
  getListCatalogItemsQueryKey,
  getListLooksQueryKey,
  LookSelections,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { snapshotSrc } from '@/lib/snapshot';
import { Canvas3D, SKIN_TONES, EYEBROW_STYLES, EYEBROW_COLORS } from '@/components/studio/Canvas3D';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type Category = "hairstyle" | "beard" | "shirt" | "pants" | "shoes";
type Tab = Category | "face" | "hat" | "glasses";

const ICONS: Record<Tab, LucideIcon> = {
  face: Smile,
  hairstyle: Scissors,
  beard: Star, // fallback icon
  shirt: Shirt,
  pants: Scissors, // fallback icon
  shoes: Star,
  hat: HardHat,
  glasses: Glasses
};

// Categories that can be dressed by scanning a photo of the real item.
const PHOTO_FIELDS = {
  shirt: 'shirtTextureUrl',
  pants: 'pantsTextureUrl',
  shoes: 'shoesTextureUrl',
  hat: 'hatTextureUrl',
  glasses: 'glassesTextureUrl',
} as const;
type PhotoTab = keyof typeof PHOTO_FIELDS;

const PHOTO_HINTS: Record<PhotoTab, { label: string; hint: string; applied: string }> = {
  shirt: { label: 'shirt', hint: 'Snap or upload a photo of a real shirt to wear it on your character.', applied: 'Your character is now wearing it.' },
  pants: { label: 'pants', hint: 'Snap or upload a photo of real pants — their look and color go onto the character.', applied: 'Your character is now wearing them.' },
  shoes: { label: 'shoes', hint: 'Snap or upload a photo of real shoes — their color is applied to the character\u2019s shoes.', applied: 'Your character is now wearing them.' },
  hat: { label: 'hat', hint: 'Snap or upload a photo of a hat or cap — the character puts one on in its color.', applied: 'Your character is now wearing it.' },
  glasses: { label: 'sunglasses', hint: 'Snap or upload a photo of glasses or shades — the character puts them on.', applied: 'Your character is now wearing them.' },
};

export default function Studio() {
  const { avatarId } = useParams();
  const id = Number(avatarId);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: avatar, isLoading: isLoadingAvatar } = useGetAvatar(id, { query: { enabled: !!id, queryKey: getGetAvatarQueryKey(id) } });
  const { data: sizeProfile } = useGetSizeProfile(id, { query: { enabled: !!id, queryKey: getGetSizeProfileQueryKey(id) } });
  const { data: catalogItems } = useListCatalogItems({}, { query: { queryKey: getListCatalogItemsQueryKey({}) } });
  const { data: looks } = useListLooks(id, { query: { enabled: !!id, queryKey: getListLooksQueryKey(id) } });
  const createLook = useCreateLook();
  const updateLook = useUpdateLook();
  const deleteLook = useDeleteLook();
  const shareLook = useShareLook();
  const unshareLook = useUnshareLook();
  const requestUploadUrl = useRequestUploadUrl();
  const [sharingLookId, setSharingLookId] = useState<number | null>(null);
  const [unsharingLookId, setUnsharingLookId] = useState<number | null>(null);
  const [renamingLookId, setRenamingLookId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteCandidate, setDeleteCandidate] = useState<{ id: number; name: string } | null>(null);

  const startRename = (lookId: number, currentName: string) => {
    setRenamingLookId(lookId);
    setRenameValue(currentName);
  };

  const handleRenameLook = (lookId: number) => {
    const name = renameValue.trim();
    if (!name) return;
    updateLook.mutate({ lookId, data: { name } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLooksQueryKey(id) });
        setRenamingLookId(null);
        toast({ title: 'Look renamed', description: `Now saved as "${name}".` });
      },
      onError: () => {
        toast({ title: "Couldn't rename look", description: 'Please try again.', variant: 'destructive' });
      },
    });
  };

  const handleDeleteLook = (lookId: number, name: string) => {
    deleteLook.mutate({ lookId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLooksQueryKey(id) });
        toast({ title: 'Look deleted', description: `"${name}" was removed from your saved looks.` });
      },
      onError: () => {
        toast({ title: "Couldn't delete look", description: 'Please try again.', variant: 'destructive' });
      },
      onSettled: () => setDeleteCandidate(null),
    });
  };

  const handleShareLook = (lookId: number) => {
    setSharingLookId(lookId);
    shareLook.mutate({ lookId }, {
      onSuccess: async ({ shareToken }) => {
        queryClient.invalidateQueries({ queryKey: getListLooksQueryKey(id) });
        const base = import.meta.env.BASE_URL.replace(/\/$/, '');
        const url = `${window.location.origin}${base}/share/${shareToken}`;
        try {
          await navigator.clipboard.writeText(url);
          toast({ title: 'Share link copied!', description: 'Anyone with the link can view this look — no login needed.' });
        } catch {
          toast({ title: 'Share link ready', description: url });
        }
      },
      onError: () => {
        toast({ title: 'Could not create share link', description: 'Please try again.', variant: 'destructive' });
      },
      onSettled: () => setSharingLookId(null),
    });
  };

  const handleUnshareLook = (lookId: number) => {
    setUnsharingLookId(lookId);
    unshareLook.mutate({ lookId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLooksQueryKey(id) });
        toast({ title: 'Share link turned off', description: 'The old link no longer works. Share again anytime to get a fresh link.' });
      },
      onError: () => {
        toast({ title: 'Could not turn off share link', description: 'Please try again.', variant: 'destructive' });
      },
      onSettled: () => setUnsharingLookId(null),
    });
  };

  const [activeTab, setActiveTab] = useState<Tab | null>(null);
  const [activePanel, setActivePanel] = useState<'sizes' | 'looks' | 'save' | null>(null);
  
  const [selections, setSelections] = useState<LookSelections>({
    hairstyleItemId: null, hairstyleColor: null,
    beardItemId: null, beardColor: null,
    shirtItemId: null, shirtColor: null,
    pantsItemId: null, pantsColor: null,
    shoesItemId: null, shoesColor: null,
  });

  const [newLookName, setNewLookName] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // When opening a look, set selections
  const loadLook = (lookId: number) => {
    const look = looks?.find(l => l.id === lookId);
    if (look) {
      setSelections(look.selections);
      setActivePanel(null);
      toast({ title: 'Look applied', description: `"${look.name}" is now on your avatar.` });
    } else {
      toast({
        title: "Couldn't apply look",
        description: 'This look could not be found. Try refreshing the page.',
        variant: 'destructive',
      });
    }
  };

  const handleSaveLook = async () => {
    if (!newLookName.trim()) return;
    
    let snapshotDataUrl: string | undefined = undefined;
    if (canvasRef.current) {
      try {
        // Capture the WebGL canvas as a JPEG blob
        const blob = await new Promise<Blob | null>((resolve) =>
          canvasRef.current!.toBlob(resolve, 'image/jpeg', 0.8),
        );
        if (blob) {
          // Upload the snapshot to object storage via a presigned URL,
          // then store only the object path in the database.
          const { uploadURL, objectPath } = await requestUploadUrl.mutateAsync({
            data: { name: 'snapshot.jpg', size: blob.size, contentType: 'image/jpeg' },
          });
          const put = await fetch(uploadURL, {
            method: 'PUT',
            headers: { 'Content-Type': 'image/jpeg' },
            body: blob,
          });
          if (!put.ok) throw new Error(`Snapshot upload failed (${put.status})`);
          snapshotDataUrl = objectPath;
        }
      } catch (err) {
        console.error('Snapshot capture/upload failed', err);
        toast({
          title: 'Snapshot unavailable',
          description: 'The look will be saved without a preview image.',
        });
      }
    }

    createLook.mutate({
      avatarId: id,
      data: {
        name: newLookName,
        selections,
        snapshotDataUrl
      }
    }, {
      onSuccess: (look) => {
        queryClient.invalidateQueries({ queryKey: getListLooksQueryKey(id) });
        setActivePanel(null);
        setNewLookName('');
        toast({ title: 'Look saved', description: `"${look.name}" was added to your saved looks.` });
      },
      onError: (error) => {
        console.error('Save look failed', error);
        toast({
          title: "Couldn't save look",
          description: error instanceof Error ? error.message : 'Something went wrong. Please try again.',
          variant: 'destructive',
        });
      }
    });
  };

  const selectItem = (category: Category, itemId: number, colors: string[]) => {
    setSelections(prev => {
      const next = { ...prev };
      const idKey = `${category}ItemId` as keyof LookSelections;
      const colorKey = `${category}Color` as keyof LookSelections;
      
      // @ts-ignore
      next[idKey] = itemId;
      // @ts-ignore - only set color if not already set or not in new item's colors
      if (!next[colorKey] || !colors.includes(next[colorKey])) {
        // @ts-ignore
        next[colorKey] = colors[0];
      }
      return next;
    });
  };

  const selectColor = (category: Category, colorHex: string) => {
    setSelections(prev => ({
      ...prev,
      [`${category}Color`]: colorHex
    }));
  };

  // Photo-to-clothing: read a photo of a real item (shirt, pants, shoes, hat,
  // sunglasses), downscale it to a compact JPEG data URL, and store it in the
  // look so the character "wears" it.
  const photoUploadRef = useRef<HTMLInputElement | null>(null);
  const photoCameraRef = useRef<HTMLInputElement | null>(null);
  const handleItemPhoto = (tab: PhotoTab, file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Unsupported file', description: 'Please choose an image.', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const size = 512;
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        const ctx = c.getContext('2d');
        if (!ctx) return;
        const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        const dataUrl = c.toDataURL('image/jpeg', 0.82);
        setSelections(prev => ({ ...prev, [PHOTO_FIELDS[tab]]: dataUrl }));
        const meta = PHOTO_HINTS[tab];
        toast({ title: `${meta.label.charAt(0).toUpperCase()}${meta.label.slice(1)} photo applied`, description: meta.applied });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const activeCategoryItems = useMemo(() => {
    if (!activeTab || !catalogItems) return [];
    return catalogItems.filter(item => item.category === activeTab);
  }, [activeTab, catalogItems]);

  if (isLoadingAvatar || !avatar) {
    return (
      <div className="min-h-[100dvh] flex bg-background items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col md:flex-row bg-background overflow-hidden text-foreground">
      {/* 3D Viewport - Takes up remaining space */}
      <div className="flex-1 relative order-2 md:order-1 h-full">
        {/* Navigation / Header overlaid */}
        <div className="absolute top-0 left-0 right-0 p-4 md:p-8 z-20 flex justify-between items-start pointer-events-none">
          <Link href="/hub" className="pointer-events-auto w-12 h-12 bg-background/80 backdrop-blur-md rounded-full flex items-center justify-center border border-border shadow-lg hover:bg-secondary transition-colors">
            <ChevronLeft className="w-6 h-6" />
          </Link>

          <div className="flex flex-col gap-3 pointer-events-auto">
            <button 
              onClick={() => setActivePanel(activePanel === 'sizes' ? null : 'sizes')}
              className="w-12 h-12 bg-background/80 backdrop-blur-md rounded-full flex items-center justify-center border border-border shadow-lg hover:bg-secondary transition-colors text-primary"
            >
              <Ruler className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setActivePanel(activePanel === 'looks' ? null : 'looks')}
              className="w-12 h-12 bg-background/80 backdrop-blur-md rounded-full flex items-center justify-center border border-border shadow-lg hover:bg-secondary transition-colors text-accent"
            >
              <History className="w-5 h-5" />
            </button>
            <button
              onClick={() => setActivePanel('save')}
              aria-label="Save Look"
              className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-xl shadow-primary/20 hover:bg-primary/90 transition-colors"
            >
              <Save className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 3D Canvas */}
        <Canvas3D 
          avatar={avatar} 
          selections={selections} 
          catalogItems={catalogItems || []} 
          canvasRef={canvasRef} 
        />

        {/* Overlay Panels */}
        <AnimatePresence>
          {activePanel && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="absolute top-20 right-20 w-80 max-h-[70vh] bg-card/95 backdrop-blur-xl border border-border rounded-3xl shadow-2xl z-30 overflow-hidden flex flex-col"
            >
              <div className="p-4 border-b border-border flex justify-between items-center bg-muted/30">
                <h3 className="font-bold font-serif text-lg">
                  {activePanel === 'sizes' && 'Size Recommendations'}
                  {activePanel === 'looks' && 'Saved Looks'}
                  {activePanel === 'save' && 'Save This Look'}
                </h3>
                <button onClick={() => setActivePanel(null)} className="p-1 rounded-full hover:bg-secondary">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto flex-1">
                {activePanel === 'sizes' && (
                  <div className="space-y-4">
                    {sizeProfile?.length === 0 && <p className="text-muted-foreground text-sm">No recommendations yet.</p>}
                    {sizeProfile?.map(rec => (
                      <div key={rec.category} className="bg-secondary/50 rounded-2xl p-4">
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
                )}

                {activePanel === 'looks' && (
                  <div className="space-y-4">
                    {looks?.length === 0 && <p className="text-muted-foreground text-sm">No saved looks.</p>}
                    {looks?.map(look => (
                      <div key={look.id} className="rounded-2xl overflow-hidden border border-border bg-secondary/20 hover:border-primary transition-all">
                        <div className="group relative">
                          {look.snapshotDataUrl ? (
                            <img src={snapshotSrc(look.snapshotDataUrl)} alt={look.name} className="w-full aspect-square object-cover" />
                          ) : (
                            <div className="w-full aspect-square bg-secondary flex items-center justify-center">
                              <Eye className="w-8 h-8 text-muted-foreground" />
                            </div>
                          )}
                          <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                            <span className="text-white font-medium block truncate">{look.name}</span>
                          </div>
                          <button 
                            onClick={() => loadLook(look.id)}
                            className="absolute inset-0 w-full h-full bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100"
                          >
                            <span className="bg-primary text-primary-foreground px-4 py-2 rounded-full font-bold text-sm shadow-lg mb-8">Apply Look</span>
                          </button>
                          
                          <button
                            onClick={(e) => { e.stopPropagation(); handleShareLook(look.id); }}
                            disabled={sharingLookId === look.id}
                            className="absolute top-2 left-2 p-2 bg-background/80 backdrop-blur-md rounded-full opacity-0 group-hover:opacity-100 hover:bg-secondary transition-all hover:scale-110 z-10 disabled:opacity-50"
                            title="Share Look"
                            data-testid={`button-share-look-${look.id}`}
                          >
                            <Share2 className="w-4 h-4 text-foreground" />
                          </button>

                          {look.shareToken && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleUnshareLook(look.id); }}
                              disabled={unsharingLookId === look.id}
                              className="absolute top-2 left-12 p-2 bg-background/80 backdrop-blur-md rounded-full opacity-0 group-hover:opacity-100 hover:bg-destructive/20 transition-all hover:scale-110 z-10 disabled:opacity-50"
                              title="Turn off share link"
                              data-testid={`button-unshare-look-${look.id}`}
                            >
                              <Link2Off className="w-4 h-4 text-destructive" />
                            </button>
                          )}

                          {look.snapshotDataUrl && (
                            <a 
                              href={snapshotSrc(look.snapshotDataUrl)}
                              download={`${look.name.replace(/\s+/g, '-').toLowerCase()}-snapshot.jpg`}
                              className="absolute top-2 right-2 p-2 bg-background/80 backdrop-blur-md rounded-full opacity-0 group-hover:opacity-100 hover:bg-secondary transition-all hover:scale-110 z-10"
                              onClick={(e) => e.stopPropagation()}
                              title="Download Snapshot"
                            >
                              <Download className="w-4 h-4 text-foreground" />
                            </a>
                          )}
                        </div>

                        {renamingLookId === look.id ? (
                          <div className="flex items-center gap-2 p-2 bg-card">
                            <Input
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleRenameLook(look.id);
                                if (e.key === 'Escape') setRenamingLookId(null);
                              }}
                              className="h-8 rounded-lg text-sm"
                              autoFocus
                              data-testid={`input-rename-look-${look.id}`}
                            />
                            <button
                              onClick={() => handleRenameLook(look.id)}
                              disabled={!renameValue.trim() || updateLook.isPending}
                              className="p-1.5 rounded-lg text-primary hover:bg-secondary disabled:opacity-50"
                              title="Save name"
                              data-testid={`button-confirm-rename-look-${look.id}`}
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setRenamingLookId(null)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1 p-2 bg-card">
                            <button
                              onClick={() => startRename(look.id, look.name)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                              title="Rename Look"
                              data-testid={`button-rename-look-${look.id}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteCandidate({ id: look.id, name: look.name })}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title="Delete Look"
                              data-testid={`button-delete-look-${look.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {activePanel === 'save' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Name this look</label>
                      <Input 
                        value={newLookName} 
                        onChange={e => setNewLookName(e.target.value)} 
                        placeholder="e.g. Summer Wedding"
                        className="rounded-xl"
                        autoFocus
                      />
                    </div>
                    <Button 
                      className="w-full rounded-xl" 
                      disabled={!newLookName.trim() || createLook.isPending}
                      onClick={handleSaveLook}
                    >
                      {createLook.isPending ? 'Saving...' : 'Save Look'}
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AlertDialog open={!!deleteCandidate} onOpenChange={(open) => { if (!open) setDeleteCandidate(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this look?</AlertDialogTitle>
              <AlertDialogDescription>
                "{deleteCandidate?.name}" will be permanently removed from your saved looks. This can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete-look">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteCandidate && handleDeleteLook(deleteCandidate.id, deleteCandidate.name)}
                disabled={deleteLook.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete-look"
              >
                {deleteLook.isPending ? 'Deleting...' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Right Side - Customization Rail & Drawer */}
      <div className="w-full md:w-auto md:min-w-[400px] h-[40vh] md:h-full bg-card border-t md:border-t-0 md:border-l border-border flex flex-col order-1 md:order-2 z-30">
        
        {/* Active Category Panel (Slides up on mobile, left on desktop) */}
        <div className="flex-1 overflow-y-auto p-6 relative">
          <AnimatePresence mode="wait">
            {activeTab === 'face' ? (
              <motion.div
                key="face"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <h2 className="text-2xl font-bold font-serif">Face</h2>

                {/* Skin tone */}
                <div className="space-y-3">
                  <label className="text-sm font-semibold">Skin tone</label>
                  <div className="flex flex-wrap gap-3">
                    {SKIN_TONES.map(tone => (
                      <button
                        key={tone}
                        data-testid={`skin-tone-${tone}`}
                        onClick={() => setSelections(p => ({ ...p, skinTone: tone }))}
                        className={`w-9 h-9 rounded-full border border-black/10 transition-transform ${
                          (selections.skinTone || avatar.skinTone) === tone ? 'scale-125 ring-2 ring-primary ring-offset-2 ring-offset-background' : 'hover:scale-110'
                        }`}
                        style={{ backgroundColor: tone }}
                      />
                    ))}
                  </div>
                </div>

                {/* Eyebrow style */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-semibold">Eyebrows</label>
                    {selections.eyebrowStyle && (
                      <button
                        onClick={() => setSelections(p => ({ ...p, eyebrowStyle: null }))}
                        className="text-sm text-destructive hover:underline font-medium"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {EYEBROW_STYLES.map(b => (
                      <button
                        key={b.key}
                        data-testid={`eyebrow-style-${b.key}`}
                        onClick={() => setSelections(p => ({ ...p, eyebrowStyle: b.key, eyebrowColor: p.eyebrowColor || EYEBROW_COLORS[0] }))}
                        className={`rounded-2xl border-2 p-3 text-sm font-medium transition-all ${
                          selections.eyebrowStyle === b.key ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/50'
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Eyebrow color */}
                {selections.eyebrowStyle && (
                  <div className="space-y-3">
                    <label className="text-sm font-semibold">Eyebrow color</label>
                    <div className="flex flex-wrap gap-3">
                      {EYEBROW_COLORS.map(color => (
                        <button
                          key={color}
                          onClick={() => setSelections(p => ({ ...p, eyebrowColor: color }))}
                          className={`w-8 h-8 rounded-full border border-black/10 transition-transform ${
                            selections.eyebrowColor === color ? 'scale-125 ring-2 ring-primary ring-offset-2 ring-offset-background' : 'hover:scale-110'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            ) : activeTab ? (
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold font-serif capitalize">{activeTab}</h2>
                  {/* Deselect button */}
                  {selections[`${activeTab}ItemId` as keyof LookSelections] && (
                    <button 
                      onClick={() => setSelections(p => ({ ...p, [`${activeTab}ItemId`]: null, [`${activeTab}Color`]: null }))}
                      className="text-sm text-destructive hover:underline font-medium"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
                  {activeCategoryItems.map(item => {
                    const isSelected = selections[`${activeTab}ItemId` as keyof LookSelections] === item.id;
                    const selectedColor = selections[`${activeTab}Color` as keyof LookSelections] as string || item.colors[0];

                    return (
                      <div 
                        key={item.id}
                        className={`rounded-2xl border-2 p-4 cursor-pointer transition-all ${
                          isSelected 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border bg-card hover:border-primary/50'
                        }`}
                        onClick={() => selectItem(activeTab as Category, item.id, item.colors)}
                      >
                        <div className="font-semibold mb-1 truncate">{item.name}</div>
                        {item.description && <div className="text-xs text-muted-foreground truncate mb-3">{item.description}</div>}
                        
                        {/* Color Picker inside item card if selected */}
                        {isSelected && item.colors.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2 pt-3 border-t border-border/50">
                            {item.colors.map(color => (
                              <button
                                key={color}
                                onClick={(e) => { e.stopPropagation(); selectColor(activeTab as Category, color); }}
                                className={`w-6 h-6 rounded-full border border-black/10 transition-transform ${
                                  selectedColor === color ? 'scale-125 ring-2 ring-primary ring-offset-2 ring-offset-background' : 'hover:scale-110'
                                }`}
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Photo-to-clothing: scan a real item with the camera or upload a photo */}
                {activeTab in PHOTO_FIELDS && (() => {
                  const tab = activeTab as PhotoTab;
                  const field = PHOTO_FIELDS[tab];
                  const meta = PHOTO_HINTS[tab];
                  const current = selections[field];
                  return (
                    <div className="mt-4 space-y-3 border-t border-border pt-5">
                      <label className="text-sm font-semibold block">Scan from photo</label>
                      <p className="text-xs text-muted-foreground">{meta.hint}</p>
                      <input
                        ref={photoCameraRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        data-testid={`input-${tab}-camera`}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleItemPhoto(tab, f); e.target.value = ''; }}
                      />
                      <input
                        ref={photoUploadRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        data-testid={`input-${tab}-photo`}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleItemPhoto(tab, f); e.target.value = ''; }}
                      />
                      <div className="flex items-center gap-3 flex-wrap">
                        <Button variant="outline" className="rounded-xl" onClick={() => photoCameraRef.current?.click()}>
                          <Camera className="w-4 h-4 mr-2" /> Scan with camera
                        </Button>
                        <Button variant="outline" className="rounded-xl" onClick={() => photoUploadRef.current?.click()}>
                          <ImagePlus className="w-4 h-4 mr-2" /> {current ? 'Replace photo' : 'Upload photo'}
                        </Button>
                        {current && (
                          <>
                            <img src={current} alt={meta.label} className="w-12 h-12 rounded-lg object-cover border border-border" />
                            <button
                              onClick={() => setSelections(p => ({ ...p, [field]: null }))}
                              className="text-sm text-destructive hover:underline font-medium"
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </motion.div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                <Shirt className="w-16 h-16 mb-4 opacity-20" />
                <p className="text-lg">Select a category to customize</p>
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Icon Rail */}
        <div className="h-24 border-t border-border bg-muted/30 flex items-center justify-center gap-2 md:gap-4 px-4 pb-safe">
          {(["face", "hairstyle", "beard", "shirt", "pants", "shoes", "hat", "glasses"] as Tab[]).map(cat => {
            const Icon = ICONS[cat] || Plus;
            const isActive = activeTab === cat;
            const hasSelection = cat === 'face'
              ? !!(selections.skinTone || selections.eyebrowStyle)
              : cat === 'hat' || cat === 'glasses'
              ? !!selections[PHOTO_FIELDS[cat]]
              : !!(selections[`${cat}ItemId` as keyof LookSelections] || (cat in PHOTO_FIELDS && selections[PHOTO_FIELDS[cat as PhotoTab]]));
            
            return (
              <button
                key={cat}
                onClick={() => setActiveTab(cat)}
                className={`relative flex flex-col items-center justify-center w-16 h-16 rounded-2xl transition-all ${
                  isActive 
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-110' 
                    : 'bg-card text-foreground hover:bg-secondary border border-border'
                }`}
              >
                <Icon className="w-6 h-6 mb-1" />
                <span className="text-[10px] font-semibold uppercase tracking-tighter opacity-80">{cat}</span>
                {hasSelection && !isActive && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-accent rounded-full border-2 border-background" />
                )}
              </button>
            )
          })}
        </div>

      </div>
    </div>
  );
}
