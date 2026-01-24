import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from './ui/button';
import { Menu, X, LogOut, User, Settings, Shield, ChevronDown, Webhook, Key, KeyRound, Gauge, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
  user?: {
    name: string | null;
    email: string | null;
    avatar: string | null;
  } | null;
  onLogout?: () => void;
}

export function Header({ user: initialUser, onLogout }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const router = useRouter();

  // Load user data from localStorage
  const [user, setUser] = useState<{
    name: string | null;
    email: string | null;
    avatar: string | null;
  } | null>(initialUser || null);

  // Listen for storage changes (when user logs in from another tab or Dashboard updates it)
  useEffect(() => {
    const handleStorage = () => {
    try {
        const stored = localStorage.getItem('github_user');
        setUser(stored ? JSON.parse(stored) : null);
    } catch {
        setUser(null);
    }
    };

    window.addEventListener('storage', handleStorage);
    // Also check on mount in case it changed
    handleStorage();

    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Generate initials from name or email
  const getInitials = () => {
    if (user?.name) {
    return user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    if (user?.email) {
    return user.email.slice(0, 2).toUpperCase();
    }
    return '??';
  };

  const displayName = user?.name || user?.email?.split('@')[0] || 'Guest';
  const displayEmail = user?.email || 'Not logged in';

  // Lock body scroll when menu is open
  useEffect(() => {
    if (menuOpen) {
    document.body.style.overflow = 'hidden';
    } else {
    document.body.style.overflow = '';
    }
    return () => {
    document.body.style.overflow = '';
    };
  }, [menuOpen]);

  // Handle swipe gesture
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;

    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = touchStartY.current - touchEndY;

    // If swiped up more than 50px, close the menu
    if (deltaY > 50) {
    setMenuOpen(false);
    }

    touchStartY.current = null;
  };

  return (
    <>
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
    <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg gradient-accent flex items-center justify-center">
            <Shield className="w-4 h-4 text-primary-foreground" />
        </div>
        <Link href="/" className="text-xl font-semibold">
            <span className="text-gradient">Phire</span>
            <span className="text-foreground">pass</span>
        </Link>
        </div>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/nodes')}>
            Nodes
        </Button>
        <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/pat-tokens')}>
            Tokens
        </Button>
        <div className="w-px h-6 bg-border" />
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                {user?.avatar ? (
                <img
                    src={user.avatar}
                    alt={displayName}
                    className="w-8 h-8 rounded-full"
                />
                ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                    <span className="text-xs font-bold text-primary-foreground">{getInitials()}</span>
                </div>
                )}
                <div className="text-sm text-left">
                <p className="font-medium">{displayName}</p>
                <p className="text-muted-foreground text-xs">{displayEmail}</p>
                </div>
            </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => router.push('/dashboard/profile')}>
                <User className="w-4 h-4 mr-2" />
                Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
                <Settings className="w-4 h-4 mr-2" />
                Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
                <LogOut className="w-4 h-4 mr-2" />
                Logout
            </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
        </div>

        {/* Mobile Menu */}
        <Button
        variant="ghost"
        size="icon"
        className="md:hidden h-12 w-12"
        onClick={() => setMenuOpen(!menuOpen)}
        >
        {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </Button>
    </div>
    </header>

    {/* Mobile Overlay/Backdrop */}
    <div
        className={cn(
        "md:hidden fixed inset-0 top-16 bg-black/50 backdrop-blur-sm z-50 transition-opacity duration-300",
        menuOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setMenuOpen(false)}
    />

    {/* Mobile Dropdown */}
    <div
        className={cn(
        'md:hidden fixed left-0 right-0 top-16 z-[60] border-t border-border bg-card overflow-y-auto transition-all duration-300 ease-out',
        menuOpen
            ? 'max-h-[calc(100vh-4rem)] opacity-100 translate-y-0'
            : 'max-h-0 opacity-0 -translate-y-4 pointer-events-none'
        )}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
    >
        <div className="p-4 space-y-1">
        <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground">Menu</span>
            <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => setMenuOpen(false)}>
            <X className="w-5 h-5" />
            </Button>
        </div>
        <Button variant="ghost" className="w-full justify-start h-12 text-base transition-transform duration-150 active:scale-[0.98]" onClick={() => { router.push('/dashboard/nodes'); setMenuOpen(false); }}>
            <Shield className="w-5 h-5 mr-3" />
            Nodes
        </Button>
        <Button variant="ghost" className="w-full justify-start h-12 text-base transition-transform duration-150 active:scale-[0.98]" onClick={() => { router.push('/dashboard/pat-tokens'); setMenuOpen(false); }}>
            <KeyRound className="w-5 h-5 mr-3" />
            Tokens
        </Button>
        <div className="border-t border-border my-2 pt-2">
            <Button variant="ghost" className="w-full justify-start h-12 text-base transition-transform duration-150 active:scale-[0.98]" onClick={() => { router.push('/dashboard/profile'); setMenuOpen(false); }}>
            <User className="w-5 h-5 mr-3" />
            Profile
            </Button>
        </div>
        <Button variant="ghost" className="w-full justify-start h-12 text-base text-destructive transition-transform duration-150 active:scale-[0.98]" onClick={onLogout}>
            <LogOut className="w-5 h-5 mr-3" />
            Logout
        </Button>
        </div>
    </div>
    </>
  );
}
