import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, Shirt, Ruler, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const FEATURES = [
  { icon: Shirt, title: 'Try on styles', desc: 'Mix hair, tops, pants and shoes on your own avatar.' },
  { icon: Ruler, title: 'Perfect fit', desc: 'Get size recommendations from your measurements.' },
  { icon: Share2, title: 'Share looks', desc: 'Send saved looks to friends — no login required.' },
];

export default function Home() {
  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center p-6 relative overflow-hidden bg-background">
      {/* Decorative Background Elements */}
      <div className="fixed top-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-accent/10 rounded-full blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-2xl z-10 text-center"
      >
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8">
          <Sparkles className="w-4 h-4" />
          Your personal virtual dressing room
        </div>

        <h1 className="text-6xl md:text-7xl font-bold font-serif tracking-tight mb-6">
          Style{' '}
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Studio
          </span>
        </h1>

        <p className="text-muted-foreground text-lg md:text-xl max-w-lg mx-auto mb-10">
          Build a lifelike avatar, try on outfits in 3D, and find your perfect fit — all in one place.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <Link href="/sign-in" className="w-full sm:w-auto">
            <Button
              size="lg"
              className="w-full sm:w-auto h-14 px-8 rounded-2xl text-lg font-semibold shadow-lg shadow-primary/20 group"
              data-testid="button-sign-in"
            >
              Sign in
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
          <Link href="/sign-up" className="w-full sm:w-auto">
            <Button
              size="lg"
              variant="outline"
              className="w-full sm:w-auto h-14 px-8 rounded-2xl text-lg font-semibold border-2"
              data-testid="button-create-account"
            >
              Create account
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.1 }}
              className="bg-card border border-card-border rounded-3xl p-6 text-left shadow-sm"
            >
              <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <f.icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-lg mb-1">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
