import { Link } from 'wouter';
import { Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background text-center px-4">
      <div className="space-y-6 max-w-md">
        <h1 className="text-9xl font-bold font-serif text-primary">404</h1>
        <h2 className="text-3xl font-bold">Page not found</h2>
        <p className="text-muted-foreground text-lg">
          We couldn't find the page you're looking for. It might have been moved or deleted.
        </p>
        <Button asChild className="h-14 px-8 rounded-full text-lg mt-4">
          <Link href="/">
            <Home className="w-5 h-5 mr-2" />
            Back to Home
          </Link>
        </Button>
      </div>
    </div>
  );
}
