import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Button } from './ui/button';
import { Menu, X, LogOut, User, Settings, Shield, KeyRound, Activity, Server, Users, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IS_DEV_MODE } from '@/lib/dev-mode';
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

type NavItem = {
    href: string;
    label: string;
    icon: LucideIcon;
    /** Hidden outside dev builds; see IS_DEV_MODE. */
    devOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
    { href: '/dashboard/nodes', label: 'Nodes', icon: Shield },
    { href: '/dashboard/pat-tokens', label: 'Tokens', icon: KeyRound },
    { href: '/dashboard/uptime', label: 'Uptime', icon: Activity, devOnly: true },
    // Administrative surfaces. Dev-only until RBAC can restrict them to the
    // roles that should see them at all — see src/lib/rbac.ts.
    { href: '/dashboard/servers', label: 'Servers', icon: Server, devOnly: true },
    { href: '/dashboard/users', label: 'Users', icon: Users, devOnly: true },
];

export function Header({ user, onLogout }: HeaderProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const [identityBlurred, setIdentityBlurred] = useState(false);
    const identityClickTimer = useRef(0);
    const touchStartY = useRef<number | null>(null);
    const router = useRouter();
    const pathname = usePathname();
    const isActivePath = (path: string) => pathname === path || pathname?.startsWith(`${path}/`);

    const navItems = NAV_ITEMS.filter((item) => !item.devOnly || IS_DEV_MODE);

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
                            <Shield className="w-4 h-4 text-white" />
                        </div>
                        <Link href="/" className="text-xl font-semibold tracking-tight">
                            <span className="text-gradient">Phire</span>
                            <span className="text-foreground">pass</span>
                        </Link>
                    </div>

                    {/* Desktop Nav — the active route carries an accent underline
                        rather than a filled pill, so the bar stays quiet. */}
                    <div className="hidden md:flex items-center gap-1">
                        <nav className="flex items-center gap-1" aria-label="Main">
                            {navItems.map((item) => {
                                const active = isActivePath(item.href);

                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        aria-current={active ? 'page' : undefined}
                                        className={cn(
                                            'relative flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors',
                                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                            active
                                                ? 'text-foreground'
                                                : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                                        )}
                                    >
                                        <item.icon className="h-4 w-4" />
                                        {item.label}
                                        {item.devOnly ? (
                                            <span className="rounded border border-warning/40 bg-warning/10 px-1 py-px font-mono text-[10px] uppercase tracking-wide text-warning">
                                                dev
                                            </span>
                                        ) : null}
                                        <span
                                            aria-hidden
                                            className={cn(
                                                // Sits on the header's bottom border: 64px bar, 36px link,
                                                // so 14px of slack below the link reaches the rule.
                                                'absolute inset-x-2 -bottom-[14px] h-0.5 rounded-full transition-opacity',
                                                active ? 'bg-accent opacity-100' : 'opacity-0'
                                            )}
                                        />
                                    </Link>
                                );
                            })}
                        </nav>
                        <div className="mx-3 w-px h-6 bg-border" />
                        <DropdownMenu open={profileMenuOpen} onOpenChange={setProfileMenuOpen} modal={false}>
                            <DropdownMenuTrigger asChild>
                                <button className="flex items-center gap-3 rounded-lg px-1 py-1 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                    {user?.avatar ? (
                                        <img
                                            src={user.avatar}
                                            alt={displayName}
                                            className="w-8 h-8 rounded-full ring-1 ring-border"
                                        />
                                    ) : (
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                                            <span className="text-xs font-bold text-primary-foreground">{getInitials()}</span>
                                        </div>
                                    )}
                                    <div
                                        className={cn('text-sm text-left', identityBlurred && 'blur-sm select-none')}
                                        onPointerDown={(e) => {
                                            const now = Date.now();
                                            if (now - identityClickTimer.current < 400) {
                                                e.stopPropagation();
                                                setProfileMenuOpen(false);
                                                setIdentityBlurred((blurred) => !blurred);
                                                identityClickTimer.current = 0;
                                            } else {
                                                identityClickTimer.current = now;
                                            }
                                        }}
                                    >
                                        <p className="font-medium leading-tight">{displayName}</p>
                                        <p className="text-muted-foreground text-xs leading-tight">{displayEmail}</p>
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
                        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                        aria-expanded={menuOpen}
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
                        <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
                            <X className="w-5 h-5" />
                        </Button>
                    </div>
                    {navItems.map((item) => (
                        <Button
                            key={item.href}
                            variant="ghost"
                            className={cn(
                                'w-full justify-start h-12 text-base transition-transform duration-150 active:scale-[0.98]',
                                isActivePath(item.href) && 'bg-secondary text-foreground border-l-2 border-accent rounded-l-none'
                            )}
                            aria-current={isActivePath(item.href) ? 'page' : undefined}
                            onClick={() => { router.push(item.href); setMenuOpen(false); }}
                        >
                            <item.icon className="w-5 h-5 mr-3" />
                            {item.label}
                            {item.devOnly ? (
                                <span className="ml-2 rounded border border-warning/40 bg-warning/10 px-1 py-px font-mono text-[10px] uppercase tracking-wide text-warning">
                                    dev
                                </span>
                            ) : null}
                        </Button>
                    ))}
                    <div className="border-t border-border my-2 pt-2">
                        <Button
                            variant="ghost"
                            className={cn(
                                'w-full justify-start h-12 text-base transition-transform duration-150 active:scale-[0.98]',
                                isActivePath('/dashboard/profile') && 'bg-secondary text-foreground border-l-2 border-accent rounded-l-none'
                            )}
                            aria-current={isActivePath('/dashboard/profile') ? 'page' : undefined}
                            onClick={() => { router.push('/dashboard/profile'); setMenuOpen(false); }}
                        >
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
