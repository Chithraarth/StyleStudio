import { useState, useRef, useEffect } from 'react';
import { useLocation, Redirect } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Upload, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { useCreateAvatar, useGetCurrentUser } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { Navbar } from '@/components/layout/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const SKIN_TONES = [
  '#F8D9C0', '#F2C2A0', '#E5A073', '#C67848', '#8D5524', '#3E2723'
];

export default function NewAvatar() {
  const [, setLocation] = useLocation();
  const createAvatar = useCreateAvatar();
  const { toast } = useToast();

  const { data: user, error: userError } = useGetCurrentUser();
  const id = user?.id ?? 0;

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    bodyType: 'male' as 'male' | 'female',
    skinTone: SKIN_TONES[1],
    facePhotoUrl: '',
    heightCm: 175,
    weightKg: 70,
    chestCm: 95,
    waistCm: 80,
    hipCm: 95,
    inseamCm: 80,
    shoulderCm: 45,
    neckCm: 38,
    shoeSizeEu: 42
  });

  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Camera access denied", err);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setFormData(prev => ({ ...prev, facePhotoUrl: dataUrl }));
        stopCamera();
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setFormData(prev => ({ ...prev, facePhotoUrl: event.target!.result as string }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const handleNext = () => {
    if (step < 4) setStep(s => s + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(s => s - 1);
  };

  const handleSubmit = () => {
    createAvatar.mutate({
      userId: id,
      data: formData
    }, {
      onSuccess: (avatar) => {
        setLocation(`/studio/${avatar.id}`);
      },
      onError: (error) => {
        console.error('Create avatar failed', error);
        toast({
          title: "Couldn't create avatar",
          description: error instanceof Error ? error.message : 'Something went wrong. Please check your inputs and try again.',
          variant: 'destructive',
        });
      }
    });
  };

  // If the current-user query fails with 401, the session is gone — go home.
  if (userError && (userError as { status?: number }).status === 401) {
    return <Redirect to="/" />;
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <Navbar title="Create Avatar" backTo="/hub" showSignOut />
      
      <div className="flex-1 container mx-auto px-4 py-8 max-w-2xl flex flex-col">
        {/* Progress Bar */}
        <div className="flex items-center justify-between mb-8 relative">
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 bg-secondary -z-10" />
          <div 
            className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary -z-10 transition-all duration-300"
            style={{ width: `${((step - 1) / 3) * 100}%` }}
          />
          {[1, 2, 3, 4].map(i => (
            <div 
              key={i} 
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors border-4 border-background ${
                step >= i ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
              }`}
            >
              {i}
            </div>
          ))}
        </div>

        <div className="flex-1 bg-card rounded-3xl border border-card-border p-6 md:p-8 shadow-sm overflow-hidden relative">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="text-center mb-8">
                  <h2 className="text-3xl font-bold font-serif mb-2">Basics</h2>
                  <p className="text-muted-foreground">Let's start with the fundamentals.</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Avatar Name</Label>
                    <Input 
                      id="name" 
                      value={formData.name} 
                      onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} 
                      placeholder="e.g. My Formal Look, Weekend Vibe..."
                      className="h-14 rounded-2xl"
                    />
                  </div>

                  <div className="space-y-2 pt-4">
                    <Label>Body Type</Label>
                    <div className="grid grid-cols-2 gap-4">
                      {['male', 'female'].map(type => (
                        <button
                          key={type}
                          onClick={() => setFormData(p => ({ ...p, bodyType: type as any }))}
                          className={`h-16 rounded-2xl border-2 capitalize font-semibold transition-all ${
                            formData.bodyType === type 
                              ? 'border-primary bg-primary/5 text-primary' 
                              : 'border-border bg-secondary/30 hover:bg-secondary'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6 flex flex-col items-center"
              >
                <div className="text-center mb-4">
                  <h2 className="text-3xl font-bold font-serif mb-2">Face Capture</h2>
                  <p className="text-muted-foreground">Optional: Snap a photo for your avatar's face.</p>
                </div>

                <div className="w-full max-w-sm aspect-square bg-secondary rounded-full overflow-hidden relative border-4 border-card-border flex items-center justify-center">
                  {formData.facePhotoUrl ? (
                    <img src={formData.facePhotoUrl} alt="Face" className="w-full h-full object-cover" />
                  ) : stream ? (
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                  ) : (
                    <div className="text-muted-foreground flex flex-col items-center">
                      <Camera className="w-12 h-12 mb-2 opacity-50" />
                      <span className="font-medium">No photo</span>
                    </div>
                  )}
                  <canvas ref={canvasRef} className="hidden" />
                </div>

                <div className="flex gap-4 w-full max-w-sm">
                  {stream ? (
                    <Button onClick={takePhoto} className="flex-1 h-14 rounded-2xl text-lg">
                      <Camera className="w-5 h-5 mr-2" /> Snap
                    </Button>
                  ) : (
                    <>
                      <Button onClick={startCamera} variant="outline" className="flex-1 h-14 rounded-2xl border-2">
                        <Camera className="w-5 h-5 mr-2" /> Camera
                      </Button>
                      <div className="relative flex-1">
                        <Input 
                          type="file" 
                          accept="image/*" 
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                          onChange={handleFileUpload}
                        />
                        <Button variant="outline" className="w-full h-14 rounded-2xl border-2 pointer-events-none">
                          <Upload className="w-5 h-5 mr-2" /> Upload
                        </Button>
                      </div>
                    </>
                  )}
                </div>

                {formData.facePhotoUrl && (
                  <Button variant="ghost" onClick={() => setFormData(p => ({ ...p, facePhotoUrl: '' }))}>
                    Remove Photo
                  </Button>
                )}

                <div className="w-full pt-6 space-y-4">
                  <Label className="text-center block">Skin Tone</Label>
                  <div className="flex justify-center gap-3">
                    {SKIN_TONES.map(hex => (
                      <button
                        key={hex}
                        onClick={() => setFormData(p => ({ ...p, skinTone: hex }))}
                        className={`w-12 h-12 rounded-full transition-transform ${formData.skinTone === hex ? 'scale-125 ring-4 ring-primary ring-offset-2 ring-offset-background' : 'hover:scale-110'}`}
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="text-center mb-8">
                  <h2 className="text-3xl font-bold font-serif mb-2">Core Measurements</h2>
                  <p className="text-muted-foreground">This helps size your clothes properly.</p>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Height (cm)</Label>
                    <Input 
                      type="number" 
                      value={formData.heightCm} 
                      onChange={e => setFormData(p => ({ ...p, heightCm: Number(e.target.value) }))}
                      className="h-14 rounded-2xl text-lg text-center"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Weight (kg)</Label>
                    <Input 
                      type="number" 
                      value={formData.weightKg} 
                      onChange={e => setFormData(p => ({ ...p, weightKg: Number(e.target.value) }))}
                      className="h-14 rounded-2xl text-lg text-center"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Shoe Size (EU)</Label>
                    <Input 
                      type="number" 
                      value={formData.shoeSizeEu} 
                      onChange={e => setFormData(p => ({ ...p, shoeSizeEu: Number(e.target.value) }))}
                      className="h-14 rounded-2xl text-lg text-center"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="text-center mb-8">
                  <h2 className="text-3xl font-bold font-serif mb-2">Detailed Fit</h2>
                  <p className="text-muted-foreground">Optional, but highly recommended for accurate sizing.</p>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  {[
                    { key: 'chestCm', label: 'Chest (cm)' },
                    { key: 'waistCm', label: 'Waist (cm)' },
                    { key: 'hipCm', label: 'Hips (cm)' },
                    { key: 'shoulderCm', label: 'Shoulders (cm)' },
                    { key: 'inseamCm', label: 'Inseam (cm)' },
                    { key: 'neckCm', label: 'Neck (cm)' },
                  ].map(({ key, label }) => (
                    <div key={key} className="space-y-2">
                      <Label>{label}</Label>
                      <Input 
                        type="number" 
                        value={formData[key as keyof typeof formData] as number} 
                        onChange={e => setFormData(p => ({ ...p, [key]: Number(e.target.value) }))}
                        className="h-12 rounded-xl text-center bg-secondary/30"
                      />
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between mt-8">
          <Button 
            variant="ghost" 
            onClick={handleBack} 
            disabled={step === 1}
            className="h-14 px-6 rounded-2xl text-lg font-medium"
          >
            <ArrowLeft className="w-5 h-5 mr-2" /> Back
          </Button>

          {step < 4 ? (
            <Button 
              onClick={handleNext} 
              disabled={step === 1 && !formData.name.trim()}
              className="h-14 px-8 rounded-2xl text-lg font-bold shadow-lg shadow-primary/20"
            >
              Next <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          ) : (
            <Button 
              onClick={handleSubmit} 
              disabled={createAvatar.isPending}
              className="h-14 px-8 rounded-2xl text-lg font-bold bg-accent hover:bg-accent/90 text-accent-foreground shadow-lg shadow-accent/20"
            >
              {createAvatar.isPending ? 'Creating...' : 'Enter Studio'}
              {!createAvatar.isPending && <Check className="w-5 h-5 ml-2" />}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
