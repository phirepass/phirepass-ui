import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Button } from './ui/button';
import {
    Menu, X, LogOut, Settings, Shield, KeyRound, Activity, Server, Users, LifeBuoy, Bell, Workflow,
    ChevronsUpDown, LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDevSurfaceVisible } from '@/hooks/use-dev-surface';
import { useDemoMode } from '@/components/DemoModeProvider';
import { can, type Permission } from '@/lib/rbac';
import { useCurrentRole, useCurrentOrg } from '@/lib/session';
import { PhirepassLogo } from '@/components/PhirepassLogo';
import { ContactSupportDialog } from '@/components/ContactSupportDialog';
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
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
    /**
     * Shown only to a role that holds this permission. Unlike `devOnly` this is
     * a real gate rather than a placeholder for one — the page and the route
     * behind it check the same constant (`src/lib/rbac.ts`).
     */
    permission?: Permission;
    /**
     * Hidden while demo data is on, for a page that has no fixture behind it.
     * Left visible it would show the presenter's real data beside a sample
     * fleet, which is the one failure demo mode exists to prevent.
     */
    demoUnsafe?: boolean;
};

type NavGroup = { label: string; items: NavItem[] };

/**
 * Grouped by what the pages are about: the machines and checks you run, then
 * the people in the workspace, then your own account. The account group sits
 * at the foot of the sidebar, next to the identity it belongs to.
 */
const NAV_GROUPS: NavGroup[] = [
    {
        label: 'Infrastructure',
        items: [
            { href: '/dashboard/nodes', label: 'Nodes', icon: Shield },
            { href: '/dashboard/monitors', label: 'Monitors', icon: Activity },
            // Nothing runs these yet — see the notice on the page itself.
            { href: '/dashboard/pipelines', label: 'Pipelines', icon: Workflow, devOnly: true },
            { href: '/dashboard/servers', label: 'Servers', icon: Server, devOnly: true },
        ],
    },
    {
        label: 'Workspace',
        items: [
            // Needs `users:read`, so a plain member never sees it, and it closes
            // during a demo because there is no members fixture.
            { href: '/dashboard/users', label: 'Members', icon: Users, permission: 'users:read', demoUnsafe: true },
        ],
    },
];

const ACCOUNT_ITEMS: NavItem[] = [
    { href: '/dashboard/pat-tokens', label: 'Tokens', icon: KeyRound },
    { href: '/dashboard/notifications', label: 'Notifications', icon: Bell },
    { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

function DevTag() {
    return (
        <span className="ml-auto rounded-sm border border-warning/40 px-1 font-mono text-[10px] leading-4 text-warning">
            dev
        </span>
    );
}

/**
 * One row of the sidebar. The active route is marked with a cobalt rule on
 * its leading edge and a raised fill — position and colour both, so it does
 * not rely on hue alone.
 */
function NavRow({ item, active, onNavigate, size = 'sm' }: {
    item: NavItem;
    active: boolean;
    onNavigate?: () => void;
    size?: 'sm' | 'lg';
}) {
    return (
        <Link
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
                'relative flex items-center gap-2.5 rounded-md px-2.5 font-medium transition-colors duration-100',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                size === 'sm' ? 'h-8 text-[13px]' : 'h-11 text-[15px]',
                active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:inset-y-1.5 before:-left-3 before:w-[3px] before:rounded-r-sm before:bg-accent [&_svg]:text-accent'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground [&_svg]:text-muted-foreground',
            )}
        >
            <item.icon className={size === 'sm' ? 'h-4 w-4 shrink-0' : 'h-5 w-5 shrink-0'} />
            <span className="truncate">{item.label}</span>
            {item.devOnly ? <DevTag /> : null}
        </Link>
    );
}

export function Header({ user, onLogout }: HeaderProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const [identityBlurred, setIdentityBlurred] = useState(false);
    const [contactOpen, setContactOpen] = useState(false);
    const identityClickTimer = useRef(0);
    const touchStartY = useRef<number | null>(null);
    const router = useRouter();
    const pathname = usePathname();
    const isActivePath = (path: string) => pathname === path || !!pathname?.startsWith(`${path}/`);

    const devSurfaces = useDevSurfaceVisible();
    const isDemo = useDemoMode();
    const role = useCurrentRole();
    const currentOrg = useCurrentOrg();

    const visible = (item: NavItem) => {
        if (item.devOnly && !devSurfaces) return false;
        if (item.demoUnsafe && isDemo) return false;
        if (item.permission && !can(role, item.permission)) return false;
        return true;
    };

    const groups = NAV_GROUPS
        .map((group) => ({ ...group, items: group.items.filter(visible) }))
        .filter((group) => group.items.length > 0);

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

    // Lock body scroll while the mobile drawer is open.
    useEffect(() => {
        document.body.style.overflow = menuOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [menuOpen]);

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartY.current = e.touches[0].clientY;
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (touchStartY.current === null) return;
        // A swipe up of more than 50px closes the drawer.
        if (touchStartY.current - e.changedTouches[0].clientY > 50) {
            setMenuOpen(false);
        }
        touchStartY.current = null;
    };

    const avatar = (sizeClass: string) => user?.avatar ? (
        <img
            src={user.avatar}
            alt=""
            className={cn(sizeClass, 'shrink-0 rounded-full object-cover ring-1 ring-hairline')}
        />
    ) : (
        <div className={cn(sizeClass, 'flex shrink-0 items-center justify-center rounded-full bg-secondary ring-1 ring-hairline')}>
            <span className="text-[11px] font-semibold text-foreground">{getInitials()}</span>
        </div>
    );

    const wordmark = (idSuffix: string) => (
        <Link href="/" className="flex min-w-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <PhirepassLogo className="h-6 w-6 shrink-0" idSuffix={idSuffix} />
            <span className="text-[15px] font-semibold text-foreground">Phirepass</span>
        </Link>
    );

    return (
        <>
            {/* Desktop sidebar */}
            <aside
                aria-label="Sidebar"
                className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-sidebar-border bg-sidebar pt-[env(safe-area-inset-top)] md:flex"
            >
                <div className="flex h-12 shrink-0 items-center px-4">
                    {wordmark('-sidebar')}
                </div>

                {/* Renders nothing for an account with one workspace. */}
                <div className="px-3 empty:hidden">
                    <WorkspaceSwitcher currentOrgId={currentOrg?.id ?? null} variant="sidebar" />
                </div>

                <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
                    {groups.map((group) => (
                        <div key={group.label}>
                            <p className="mb-1 px-2.5 text-[12px] font-medium text-muted-foreground/80">
                                {group.label}
                            </p>
                            <div className="space-y-px">
                                {group.items.map((item) => (
                                    <NavRow key={item.href} item={item} active={isActivePath(item.href)} />
                                ))}
                            </div>
                        </div>
                    ))}
                </nav>

                <div className="shrink-0 space-y-px border-t border-sidebar-border px-3 py-3">
                    {ACCOUNT_ITEMS.map((item) => (
                        <NavRow key={item.href} item={item} active={isActivePath(item.href)} />
                    ))}
                    <button
                        type="button"
                        onClick={() => setContactOpen(true)}
                        className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-sidebar-foreground/80 transition-colors duration-100 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:text-muted-foreground"
                    >
                        <LifeBuoy className="h-4 w-4 shrink-0" />
                        Contact us
                    </button>
                </div>

                <div className="shrink-0 border-t border-sidebar-border p-2 pb-[calc(0.5rem_+_env(safe-area-inset-bottom))]">
                    <DropdownMenu open={profileMenuOpen} onOpenChange={setProfileMenuOpen} modal={false}>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors duration-100 hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                {avatar('h-7 w-7')}
                                <div
                                    className={cn('min-w-0 flex-1', identityBlurred && 'blur-sm select-none')}
                                    onPointerDown={(e) => {
                                        // Double-click the identity to blur it, for
                                        // screen sharing; a single click opens the menu.
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
                                    <p className="truncate text-[13px] font-medium leading-tight text-foreground">{displayName}</p>
                                    <p className="truncate text-[11px] leading-tight text-muted-foreground">{displayEmail}</p>
                                </div>
                                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="top" align="start" className="w-[13rem]">
                            <DropdownMenuLabel className={cn('truncate text-[12px] font-normal text-muted-foreground', identityBlurred && 'blur-sm')}>
                                {displayEmail}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={onLogout}>
                                <LogOut className="mr-2 h-4 w-4" />
                                Log out
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </aside>

            {/* Mobile top bar */}
            <header className="sticky top-0 z-40 border-b border-hairline bg-background pt-[env(safe-area-inset-top)] md:hidden">
                <div className="flex h-12 items-center justify-between gap-3 px-3">
                    {wordmark('-topbar')}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10"
                        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                        aria-expanded={menuOpen}
                        onClick={() => setMenuOpen(!menuOpen)}
                    >
                        {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </Button>
                </div>
            </header>

            {/* Mobile backdrop */}
            <div
                className={cn(
                    'fixed inset-0 top-[calc(3rem_+_env(safe-area-inset-top))] z-50 bg-black/60 transition-opacity duration-200 md:hidden',
                    menuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
                )}
                onClick={() => setMenuOpen(false)}
            />

            {/* Mobile drawer */}
            <div
                className={cn(
                    'fixed left-0 right-0 top-[calc(3rem_+_env(safe-area-inset-top))] z-[60] overflow-y-auto border-b border-hairline bg-sidebar shadow-panel transition-[max-height,opacity,transform] duration-200 ease-mac md:hidden',
                    menuOpen
                        ? 'max-h-[calc(100dvh_-_3rem_-_env(safe-area-inset-top))] translate-y-0 opacity-100'
                        : 'pointer-events-none max-h-0 -translate-y-2 opacity-0'
                )}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
            >
                <div className="space-y-4 px-4 py-3 pb-[calc(1rem_+_env(safe-area-inset-bottom))]">
                    <div className="flex items-center gap-3 px-1">
                        {avatar('h-9 w-9')}
                        <div className="min-w-0">
                            <p className="truncate text-[14px] font-medium text-foreground">{displayName}</p>
                            <p className="truncate text-[12px] text-muted-foreground">{displayEmail}</p>
                        </div>
                    </div>

                    <WorkspaceSwitcher
                        currentOrgId={currentOrg?.id ?? null}
                        variant="inline"
                        onSwitch={() => setMenuOpen(false)}
                    />

                    {[...groups, { label: 'Account', items: ACCOUNT_ITEMS }].map((group) => (
                        <div key={group.label}>
                            <p className="mb-1 px-2.5 text-[12px] font-medium text-muted-foreground/80">{group.label}</p>
                            <div className="space-y-px">
                                {group.items.map((item) => (
                                    <NavRow
                                        key={item.href}
                                        item={item}
                                        size="lg"
                                        active={isActivePath(item.href)}
                                        onNavigate={() => setMenuOpen(false)}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}

                    <div className="space-y-px border-t border-hairline pt-3">
                        <button
                            type="button"
                            className="flex h-11 w-full items-center gap-2.5 rounded-md px-2.5 text-[15px] font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
                            onClick={() => { setMenuOpen(false); setContactOpen(true); }}
                        >
                            <LifeBuoy className="h-5 w-5 text-muted-foreground" />
                            Contact us
                        </button>
                        <button
                            type="button"
                            className="flex h-11 w-full items-center gap-2.5 rounded-md px-2.5 text-[15px] font-medium text-destructive hover:bg-destructive/10"
                            onClick={onLogout}
                        >
                            <LogOut className="h-5 w-5" />
                            Log out
                        </button>
                    </div>
                </div>
            </div>

            {/* Outside both menus so closing either one does not unmount the dialog. */}
            <ContactSupportDialog open={contactOpen} onOpenChange={setContactOpen} />
        </>
    );
}
