/**
 * Demo mode: the signed-in dashboard, served from a sample fleet instead of the
 * account's real one.
 *
 * It exists for showing the product when there is nothing worth showing — an
 * investor room, a booth, a screenshot — where an empty account, a cold agent,
 * or a flaky uplink is the difference between a demo and an apology.
 *
 * Three decisions shape the whole thing:
 *
 * - **It is a switch in the user's own settings, not a deployment flag.** The
 *   same production build serves it; nobody configures anything.
 * - **It lives entirely in the browser.** A patched `fetch` answers the
 *   dashboard's own API calls from a fixture (`src/lib/demo/`), so the server
 *   is not involved, no authentication is bypassed, and no real data is read or
 *   written while it is on.
 * - **It is not remembered.** The switch is React state and nothing else — no
 *   cookie, no local storage. Reloading the page, or opening a second tab,
 *   starts back on real data, which is the right default for a mode that shows
 *   people something untrue.
 *
 * @see DemoModeProvider — the switch, the patch, and `useDemoMode()`.
 */

/** Shown wherever the UI has to admit that what is on screen is not real. */
export const DEMO_LIVE_ACTION_MESSAGE =
    'Demo data is switched on, so the nodes on screen are a sample fleet — there is no agent to open a live session against. Turn it off in Settings to use your own nodes.';
