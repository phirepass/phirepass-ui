import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Button } from './ui/button';
import { Menu, X, LogOut, User, Settings, Shield, KeyRound, Activity, Server, Users, LifeBuoy, Bell, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDevSurfaceVisible } from '@/hooks/use-dev-surface';
import { PhirepassLogo } from '@/components/PhirepassLogo';
import { ContactSupportDialog } from '@/components/ContactSupportDialog';
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
    /** Hidden outside dev builds, and while demo data is on; see `useDevSurfaceVisible`. */
    devOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
    { href: '/dashboard/nodes', label: 'Nodes', icon: Shield },
    { href: '/dashboard/monitors', label: 'Monitors', icon: Activity },
    // Administrative surfaces. Dev-only until RBAC can restrict them to the
    // roles that should see them at all — see src/lib/rbac.ts.
    { href: '/dashboard/servers', label: 'Servers', icon: Server, devOnly: true },
    { href: '/dashboard/users', label: 'Users', icon: Users, devOnly: true },
];

export function Header({ user, onLogout }: HeaderProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const [identityBlurred, setIdentityBlurred] = useState(false);
    const [contactOpen, setContactOpen] = useState(false);
    const identityClickTimer = useRef(0);
    const touchStartY = useRef<number | null>(null);
    const router = useRouter();
    const pathname = usePathname();
    const isActivePath = (path: string) => pathname === path || pathname?.startsWith(`${path}/`);

    const devSurfaces = useDevSurfaceVisible();

    const navItems = NAV_ITEMS.filter((item) => !item.devOnly || devSurfaces);

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
            <header className="sticky top-0 z-40 border-b border-hairline bg-[image:var(--fill-toolbar)] mac-material pt-[env(safe-area-inset-top)]">
                <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <PhirepassLogo className="w-8 h-8" />
                        <Link href="/" className="text-xl font-semibold tracking-tight">
                            <span className="text-gradient">Phire</span>
                            <span className="text-foreground">pass</span>
                        </Link>
                    </div>

                    {/* Desktop Nav — the current route is a raised toolbar
                        item, the way macOS marks selection in a toolbar. */}
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
                                            'relative flex h-9 items-center gap-2 rounded-[8px] border px-3 text-[13px] font-medium tracking-[-0.01em] mac-squircle transition-[background-image,background-color,box-shadow,color] duration-150 ease-mac',
                                            'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45',
                                            active
                                                ? 'border-hairline bg-[image:var(--fill-control)] text-foreground shadow-control [&_svg]:text-accent'
                                                : 'border-transparent text-muted-foreground hover:bg-white/[0.06] hover:text-foreground'
                                        )}
                                    >
                                        <item.icon className="h-4 w-4" />
                                        {item.label}
                                        {item.devOnly ? (
                                            <span className="rounded border border-warning/40 bg-warning/10 px-1 py-px font-mono text-[10px] uppercase tracking-wide text-warning">
                                                dev
                                            </span>
                                        ) : null}
                                    </Link>
                                );
                            })}
                        </nav>
                        <div className="mx-3 h-6 w-px bg-hairline" />
                        <DropdownMenu open={profileMenuOpen} onOpenChange={setProfileMenuOpen} modal={false}>
                            <DropdownMenuTrigger asChild>
                                <button className="flex items-center gap-2.5 rounded-[9px] px-1.5 py-1 mac-squircle transition-colors duration-150 ease-mac hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45">
                                    {user?.avatar ? (
                                        <img
                                            src={user.avatar}
                                            alt={displayName}
                                            className="h-8 w-8 rounded-full object-cover ring-1 ring-hairline"
                                        />
                                    ) : (
                                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent shadow-control">
                                            <span className="text-xs font-bold text-primary-foreground">{getInitials()}</span>
                                        </div>
                                    )}
                                    <div
                                        className={cn('text-left', identityBlurred && 'blur-sm select-none')}
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
                                        <p className="text-[13px] font-medium leading-tight tracking-[-0.01em]">{displayName}</p>
                                        <p className="text-[11px] leading-tight text-muted-foreground">{displayEmail}</p>
                                    </div>
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                {/* Profile is still withdrawn — its route and this
                                    menu entry are disabled together, so nothing in
                                    the UI points at a redirect. */}
                                <DropdownMenuItem onClick={() => router.push('/dashboard/pat-tokens')}>
                                    <KeyRound className="w-4 h-4 mr-2" />
                                    Tokens
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
                                    <Settings className="w-4 h-4 mr-2" />
                                    Settings
                                </DropdownMenuItem>
                                {devSurfaces ? (
                                    <DropdownMenuItem onClick={() => router.push('/dashboard/notifications')}>
                                        <Bell className="w-4 h-4 mr-2" />
                                        Notifications
                                        <span className="ml-auto rounded border border-warning/40 bg-warning/10 px-1 py-px font-mono text-[10px] uppercase tracking-wide text-warning">
                                            dev
                                        </span>
                                    </DropdownMenuItem>
                                ) : null}
                                <DropdownMenuItem onClick={() => setContactOpen(true)}>
                                    <LifeBuoy className="w-4 h-4 mr-2" />
                                    Contact us
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
                    "md:hidden fixed inset-0 top-[calc(4rem_+_env(safe-area-inset-top))] bg-black/50 backdrop-blur-sm z-50 transition-opacity duration-300",
                    menuOpen ? "opacity-100" : "opacity-0 pointer-events-none"
                )}
                onClick={() => setMenuOpen(false)}
            />

            {/* Mobile Dropdown */}
            <div
                className={cn(
                    'md:hidden fixed left-0 right-0 top-[calc(4rem_+_env(safe-area-inset-top))] z-[60] overflow-y-auto border-t border-hairline bg-[image:var(--fill-panel)] shadow-panel mac-material transition-all duration-300 ease-mac',
                    menuOpen
                        ? 'max-h-[calc(100dvh_-_4rem_-_env(safe-area-inset-top))] opacity-100 translate-y-0'
                        : 'max-h-0 opacity-0 -translate-y-4 pointer-events-none'
                )}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
            >
                <div className="p-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] space-y-1">
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
                                isActivePath(item.href) && 'border-l-2 border-accent rounded-l-none bg-white/[0.07] text-foreground'
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
                    <div className="my-2 border-t border-hairline pt-2">
                        <Button
                            variant="ghost"
                            className={cn(
                                'w-full justify-start h-12 text-base transition-transform duration-150 active:scale-[0.98]',
                                isActivePath('/dashboard/pat-tokens') && 'border-l-2 border-accent rounded-l-none bg-white/[0.07] text-foreground'
                            )}
                            aria-current={isActivePath('/dashboard/pat-tokens') ? 'page' : undefined}
                            onClick={() => { router.push('/dashboard/pat-tokens'); setMenuOpen(false); }}
                        >
                            <KeyRound className="w-5 h-5 mr-3" />
                            Tokens
                        </Button>
                        <Button
                            variant="ghost"
                            className={cn(
                                'w-full justify-start h-12 text-base transition-transform duration-150 active:scale-[0.98]',
                                isActivePath('/dashboard/settings') && 'border-l-2 border-accent rounded-l-none bg-white/[0.07] text-foreground'
                            )}
                            aria-current={isActivePath('/dashboard/settings') ? 'page' : undefined}
                            onClick={() => { router.push('/dashboard/settings'); setMenuOpen(false); }}
                        >
                            <Settings className="w-5 h-5 mr-3" />
                            Settings
                        </Button>
                        {devSurfaces ? (
                            <Button
                                variant="ghost"
                                className={cn(
                                    'w-full justify-start h-12 text-base transition-transform duration-150 active:scale-[0.98]',
                                    isActivePath('/dashboard/notifications') && 'border-l-2 border-accent rounded-l-none bg-white/[0.07] text-foreground'
                                )}
                                aria-current={isActivePath('/dashboard/notifications') ? 'page' : undefined}
                                onClick={() => { router.push('/dashboard/notifications'); setMenuOpen(false); }}
                            >
                                <Bell className="w-5 h-5 mr-3" />
                                Notifications
                                <span className="ml-2 rounded border border-warning/40 bg-warning/10 px-1 py-px font-mono text-[10px] uppercase tracking-wide text-warning">
                                    dev
                                </span>
                            </Button>
                        ) : null}
                        <Button
                            variant="ghost"
                            className="w-full justify-start h-12 text-base transition-transform duration-150 active:scale-[0.98]"
                            onClick={() => { setMenuOpen(false); setContactOpen(true); }}
                        >
                            <LifeBuoy className="w-5 h-5 mr-3" />
                            Contact us
                        </Button>
                    </div>
                    <Button variant="ghost" className="w-full justify-start h-12 text-base text-destructive transition-transform duration-150 active:scale-[0.98]" onClick={onLogout}>
                        <LogOut className="w-5 h-5 mr-3" />
                        Logout
                    </Button>
                </div>
            </div>

            {/* Rendered outside both menus so closing either one does not unmount
                the open dialog. */}
            <ContactSupportDialog
                open={contactOpen}
                onOpenChange={setContactOpen}
            />
        </>
    );
}
