import { Link } from 'wouter';
import { ChevronLeft, LogOut } from 'lucide-react';
import { useClerk } from '@clerk/react';
import { Button } from '@/components/ui/button';

interface NavbarProps {
  title?: string;
  backTo?: string;
  rightAction?: React.ReactNode;
  showSignOut?: boolean;
}

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export function Navbar({ title, backTo, rightAction, showSignOut }: NavbarProps) {
  const { signOut } = useClerk();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1">
          {backTo && (
            <Link href={backTo} className="inline-flex items-center justify-center w-10 h-10 rounded-full hover:bg-secondary transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </Link>
          )}
          {title && <h1 className="text-xl font-semibold font-serif tracking-tight">{title}</h1>}
        </div>

        <div className="flex items-center justify-end gap-2 flex-1">
          {rightAction}
          {showSignOut && (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full gap-2"
              onClick={() => signOut({ redirectUrl: basePath || '/' })}
              data-testid="button-sign-out"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
