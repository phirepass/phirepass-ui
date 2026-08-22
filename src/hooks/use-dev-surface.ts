'use client';

import { useDemoMode } from '@/components/DemoModeProvider';
import { IS_DEV_MODE } from '@/lib/dev-mode';

/**
 * Whether a dev-only surface belongs on screen.
 *
 * Two gates, and the second is why this exists. A dev-gated page is by
 * definition unfinished — a mock server fleet, roles nothing enforces, a
 * notification pipeline with no delivery behind it — and demo mode is precisely
 * when unfinished things must not be visible: the audience cannot tell a shipped
 * feature from a placeholder, and a `dev` pill next to a menu item is not the
 * distinction they will take away from the room.
 *
 * So a dev surface shows only in a dev build *and* only while demo data is off.
 * Both the menu entry and the page itself consult this, because hiding the link
 * to a page is not the same as closing it.
 */
export function useDevSurfaceVisible(): boolean {
    const isDemo = useDemoMode();

    return IS_DEV_MODE && !isDemo;
}
