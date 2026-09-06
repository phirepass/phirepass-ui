'use client';

/**
 * The offer to install the dashboard as an app.
 *
 * Not vanity: on iOS an installed app is the only thing that can receive a
 * notification at all, so this is the first half of the alerting feature for
 * every iPhone — see the `needs-install` state in `src/lib/push.ts`. On
 * Chromium it is what turns a tab into something on a home screen beside the
 * other tools somebody reaches for at 3am.
 *
 * Two routes, because the platforms differ in kind rather than in degree.
 * Chromium hands us an event and we ask on its behalf. iOS has no such API —
 * a page cannot open the Share sheet — so the only honest thing is to say where
 * the button is and then get out of the way.
 */

import { Share, SquarePlus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PhirepassLogo } from '@/components/PhirepassLogo';
import { cn } from '@/lib/utils';
import { useInstallPrompt } from '@/lib/install';

export function InstallBanner() {
    const { route, dismissed, dismiss, promptInstall } = useInstallPrompt();

    if (route === 'none' || dismissed) return null;

    const manual = route === 'manual';

    return (
        <div
            className={cn(
                'fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-[image:var(--fill-panel)] shadow-panel mac-material',
                'px-4 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] pt-3',
                // A phone gets a band across the bottom, where the thumb is.
                // A desktop gets a card in the corner: there is no thumb to
                // reach it with, and a bar across a wide screen reads as a
                // cookie notice.
                'sm:inset-x-auto sm:bottom-4 sm:right-4 sm:max-w-sm sm:rounded-[12px] sm:border sm:pb-3 mac-squircle',
            )}
            role="complementary"
            aria-label="Install PhirePass"
        >
            <div className="flex items-start gap-3">
                <PhirepassLogo className="mt-0.5 h-9 w-9 shrink-0 rounded-[9px]" />

                <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium leading-tight tracking-[-0.01em] text-foreground">
                        Install PhirePass
                    </p>
                    <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                        {manual ? (
                            <>
                                Tap <Share className="inline h-3.5 w-3.5 -translate-y-px" aria-label="Share" /> then{' '}
                                <SquarePlus className="inline h-3.5 w-3.5 -translate-y-px" aria-hidden="true" />{' '}
                                <span className="text-foreground">Add to Home Screen</span>. On iOS, alerts only reach
                                an installed app.
                            </>
                        ) : (
                            'Keep your nodes one tap away, and let alerts reach this device.'
                        )}
                    </p>

                    {manual ? null : (
                        <Button size="sm" className="mt-2.5 h-8 text-[13px]" onClick={promptInstall}>
                            Install
                        </Button>
                    )}
                </div>

                <Button
                    variant="ghost"
                    size="icon"
                    className="-mr-1 -mt-1 h-8 w-8 shrink-0"
                    aria-label="Not now"
                    onClick={dismiss}
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
