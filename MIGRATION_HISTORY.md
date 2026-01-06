# Migration History

## Vite + React Router → Next.js Migration

**Date:** January 2026
**Next.js Version:** 16.1.1 (with Turbopack)

### Overview

This project was migrated from Vite + React Router to Next.js 16.1 using the App Router pattern.

### Migration Strategy

The migration used a **wrapper pattern** to minimize code changes:

-   Created `src/app/` directory structure for Next.js App Router
-   Kept original components in `src/pages/` (NOT the Next.js pages directory)
-   Each App Router page is a thin wrapper that imports the actual component from `src/pages/`

Example:

```tsx
// src/app/dashboard/page.tsx
"use client";
import Dashboard from "@/pages/Dashboard";
export default function DashboardPage() {
    return <Dashboard />;
}
```

### Key Changes

#### 1. Build System

-   **Removed:** Vite, @vitejs/plugin-react-swc
-   **Added:** Next.js 16.1.1
-   **Dev Server:** Port changed from 3000 to 8084
-   **Scripts:**
    -   `dev`: `next dev -p 8084`
    -   `build`: `next build`
    -   `start`: `next start`

#### 2. Routing

-   **Old:** React Router DOM with BrowserRouter
-   **New:** Next.js App Router (file-based routing)
-   **Files removed:** src/main.tsx, src/App.tsx, src/App.css, index.html
-   **Files added:** All files in src/app/ directory structure

#### 3. Navigation APIs

-   **useNavigate → useRouter:**

    ```tsx
    // Old
    const navigate = useNavigate();
    navigate("/dashboard");

    // New
    const router = useRouter();
    router.push("/dashboard");
    router.replace("/login"); // For replace navigation
    ```

-   **Link component:**

    ```tsx
    // Old
    <Link to="/signup">Sign Up</Link>

    // New
    <Link href="/signup">Sign Up</Link>
    ```

#### 4. Environment Variables

-   **Old:** `import.meta.env.VITE_*`
-   **New:** `process.env.NEXT_PUBLIC_*`
-   **.env.local changes:**
    -   `VITE_GITHUB_CLIENT_ID` → `NEXT_PUBLIC_GITHUB_CLIENT_ID`
    -   `VITE_API_URL` → `NEXT_PUBLIC_API_URL`
    -   Added `GITHUB_CLIENT_SECRET` for OAuth callback

#### 5. TypeScript Configuration

-   Removed `tsconfig.app.json` and `tsconfig.node.json`
-   Updated main `tsconfig.json` for Next.js:
    -   `moduleResolution: "bundler"`
    -   Added Next.js plugin
    -   Includes `src/app/**/*`

#### 6. Authentication Flow

-   **OAuth Callback:** Moved from client-side to API route
-   **Location:** `src/app/auth/github/callback/route.ts`
-   **Process:**
    1. GitHub redirects to `/auth/github/callback?code=...`
    2. API route exchanges code for access token
    3. Fetches user data from GitHub API
    4. Redirects to `/dashboard?user=...` with user data
    5. Dashboard layout stores user in localStorage

#### 7. Layouts

-   **Root Layout:** `src/app/layout.tsx`

    -   Provides QueryClientProvider, TooltipProvider, Toasters
    -   Loads Google Fonts via next/font/google

-   **Dashboard Layout:** `src/app/dashboard/layout.tsx`
    -   Handles authentication checking
    -   Provides Header and Footer
    -   Manages user state and logout

### Issues Fixed

1. **Hydration Errors:** Moved localStorage access from useState initializers to useEffect
2. **Navigation Errors:** Fixed router.push with `{ replace: true }` → router.replace()
3. **Link Errors:** Changed all Link `to` props to `href`
4. **SearchParams:** Added optional chaining for `searchParams?.get()`
5. **Duplicate Headers:** Removed from Dashboard page component (now in layout)

### File Structure

```
src/
├── app/                    # Next.js App Router (routing only)
│   ├── layout.tsx         # Root layout with providers
│   ├── page.tsx           # Home page wrapper
│   ├── not-found.tsx      # 404 page
│   ├── auth/
│   │   └── github/
│   │       └── callback/
│   │           └── route.ts  # OAuth callback API route
│   ├── dashboard/
│   │   ├── layout.tsx     # Dashboard layout with auth
│   │   ├── page.tsx       # Dashboard page wrapper
│   │   ├── nodes/
│   │   ├── settings/
│   │   └── ...
│   ├── login/
│   ├── signup/
│   └── device-auth/
│
├── pages/                  # Actual page components (NOT Next.js pages)
│   ├── Dashboard.tsx      # Real dashboard component
│   ├── Login.tsx
│   ├── Signup.tsx
│   └── ...
│
├── components/            # Reusable components
├── data/                  # Mock data
├── hooks/                 # Custom hooks
├── lib/                   # Utilities
└── types/                 # TypeScript types
```

### Important Notes

⚠️ **DO NOT DELETE src/pages/ directory** - It contains all actual page logic and is actively used by the app router wrappers.

⚠️ **Next.js API differences:**

-   `useSearchParams()` returns ReadonlyURLSearchParams (no setSearchParams)
-   `router.push()` doesn't accept options object
-   Use `router.replace()` instead of `router.push(path, { replace: true })`
-   Always use optional chaining with searchParams: `searchParams?.get()`

### Environment Setup

Required environment variables in `.env.local`:

```env
NEXT_PUBLIC_GITHUB_CLIENT_ID=Ov23lixQs35iMlLB9cBc
GITHUB_CLIENT_SECRET=<secret>
NEXT_PUBLIC_API_URL=http://localhost:8084
```

### Development

```bash
bun dev          # Start dev server on port 8084
bun build        # Build for production
bun start        # Start production server
```

### Production Build Fixes

During production build, several issues were identified and fixed:

#### 1. useSearchParams SSR Issues

**Problem:** `useSearchParams()` requires Suspense boundary for SSR/static generation
**Solution:** Replaced with `window.location.search` for client-side only usage

```tsx
// Before
const searchParams = useSearchParams();
const code = searchParams?.get("code");

// After
const code =
    typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("code")
        : null;
```

**Files affected:**

-   src/pages/Dashboard.tsx
-   src/pages/DeviceAuth.tsx
-   src/pages/Tunnels.tsx
-   src/app/dashboard/layout.tsx

#### 2. Component Props Mismatches

**Fixed prop interfaces:**

-   `BulkActionsBar`: Changed from `selectedCount`/`totalCount` to `selectedNodes` array
-   `NodeCard`: Removed `viewMode` and `selectionMode` props, using `showSelection` instead
-   `ShareManagementDialog`: Changed from `sharedNodes` array to `node` single object

#### 3. Dynamic Rendering Configuration

**Added to prevent static generation errors:**

```tsx
export const dynamic = "force-dynamic";
```

Applied to all dashboard pages and pages using searchParams.

#### 4. Unused File Cleanup

-   Renamed `src/pages/DashboardLayout.tsx` to `.bak` (superseded by `src/app/dashboard/layout.tsx`)

#### 5. Build Output

✓ TypeScript compiled successfully
✓ 14 app routes generated
✓ 16 pages routes generated
✓ Static pages prerendered
✓ Production bundle optimized

**Build Size:** `.next/` directory with optimized bundles and server functions
