# Project Structure

## PhirePass UI - Next.js Application

A Next.js 16.1 application for managing nodes, tunnels, API keys, and webhooks with GitHub OAuth authentication.

## Directory Structure

```
phirepass-ui/
├── public/                 # Static assets
│   └── robots.txt
│
├── src/
│   ├── app/               # Next.js App Router (routing layer)
│   │   ├── layout.tsx     # Root layout
│   │   ├── page.tsx       # Home page
│   │   ├── not-found.tsx  # 404 page
│   │   │
│   │   ├── auth/          # Authentication routes
│   │   │   └── github/
│   │   │       └── callback/
│   │   │           └── route.ts  # OAuth API route
│   │   │
│   │   ├── dashboard/     # Dashboard routes
│   │   │   ├── layout.tsx # Auth layout
│   │   │   ├── page.tsx   # Dashboard home
│   │   │   ├── nodes/
│   │   │   │   └── page.tsx
│   │   │   ├── api-keys/
│   │   │   │   └── page.tsx
│   │   │   ├── pat-tokens/
│   │   │   │   └── page.tsx
│   │   │   ├── webhooks/
│   │   │   │   └── page.tsx
│   │   │   ├── monitoring/
│   │   │   │   └── page.tsx
│   │   │   ├── rate-limiting/
│   │   │   │   └── page.tsx
│   │   │   ├── settings/
│   │   │   │   └── page.tsx
│   │   │   └── profile/
│   │   │       └── page.tsx
│   │   │
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── signup/
│   │   │   └── page.tsx
│   │   └── device-auth/
│   │       └── page.tsx
│   │
│   ├── pages/             # Actual page components
│   │   ├── Dashboard.tsx
│   │   ├── DashboardLayout.tsx  # Not used (superseded by app/dashboard/layout.tsx)
│   │   ├── Landing.tsx
│   │   ├── Login.tsx
│   │   ├── Signup.tsx
│   │   ├── DeviceAuth.tsx
│   │   ├── Index.tsx
│   │   ├── Nodes.tsx
│   │   ├── ApiKeys.tsx
│   │   ├── PatTokens.tsx
│   │   ├── Webhooks.tsx
│   │   ├── Monitoring.tsx
│   │   ├── RateLimiting.tsx
│   │   ├── Settings.tsx
│   │   ├── Profile.tsx
│   │   ├── NotFound.tsx
│   │   └── Tunnels.tsx
│   │
│   ├── components/        # React components
│   │   ├── ui/           # shadcn/ui components
│   │   │   ├── accordion.tsx
│   │   │   ├── alert.tsx
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── input.tsx
│   │   │   ├── table.tsx
│   │   │   ├── tabs.tsx
│   │   │   └── ...
│   │   │
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   ├── NodeCard.tsx
│   │   ├── TunnelCard.tsx
│   │   ├── RequestLogsTable.tsx
│   │   ├── WebhookInspector.tsx
│   │   └── ...
│   │
│   ├── data/              # Mock data
│   │   ├── mockNodes.ts
│   │   ├── mockTunnels.ts
│   │   ├── mockApiKeys.ts
│   │   ├── mockWebhooks.ts
│   │   └── ...
│   │
│   ├── hooks/             # Custom React hooks
│   │   ├── use-mobile.tsx
│   │   └── use-toast.ts
│   │
│   ├── lib/               # Utility libraries
│   │   └── utils.ts       # cn() and other utils
│   │
│   ├── types/             # TypeScript type definitions
│   │   ├── api-key.ts
│   │   ├── node.ts
│   │   ├── tunnel.ts
│   │   ├── webhook.ts
│   │   ├── ssh-tunnel.ts
│   │   ├── tcp-tunnel.ts
│   │   └── rate-limit.ts
│   │
│   ├── index.css          # Global styles
│   └── vite-env.d.ts      # Type definitions
│
├── .editorconfig          # Editor configuration
├── .env.local             # Environment variables
├── components.json        # shadcn/ui config
├── eslint.config.js       # ESLint configuration
├── next.config.ts         # Next.js configuration
├── package.json           # Dependencies
├── postcss.config.js      # PostCSS config
├── tailwind.config.ts     # Tailwind CSS config
├── tsconfig.json          # TypeScript config
├── Makefile              # Build commands
└── README.md             # Project documentation
```

## Key Directories

### `src/app/` - Next.js App Router
- **Purpose:** File-based routing system
- **Pattern:** Thin wrappers that import from `src/pages/`
- **All files:** Must be `'use client'` for client-side rendering
- **Special files:**
  - `layout.tsx` - Defines shared UI for routes
  - `page.tsx` - Route page component
  - `route.ts` - API route handler

### `src/pages/` - Page Components
- **Purpose:** Contains actual page logic and components
- **NOT the Next.js pages directory** (that's deprecated in App Router)
- **Imported by:** App Router page wrappers
- **Contains:** Business logic, state management, UI composition

### `src/components/` - Reusable Components
- **ui/**: shadcn/ui component library (Radix UI primitives)
- **Root level**: Application-specific components
- **Pattern**: Composable, reusable UI elements

### `src/data/` - Mock Data
- **Purpose:** Mock data for development/demo
- **Files:** TypeScript files exporting mock objects
- **Usage:** Imported in components for demonstration

### `src/types/` - Type Definitions
- **Purpose:** Centralized TypeScript type definitions
- **Pattern:** One file per domain model
- **Exports:** Interfaces and types

## Important Files

### Configuration Files

#### `next.config.ts`
```typescript
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
    reactStrictMode: true,
};
export default nextConfig;
```

#### `tailwind.config.ts`
- Defines design tokens (colors, spacing, etc.)
- Configures content paths for Tailwind
- Includes custom animations and utilities

#### `components.json`
- shadcn/ui configuration
- Component style preferences
- Path aliases

#### `.editorconfig`
- 4-space indentation
- LF line endings
- UTF-8 charset
- Trim trailing whitespace
- Insert final newline

### Core Application Files

#### `src/app/layout.tsx` (Root Layout)
- Provides global providers (QueryClient, Tooltip, Toast)
- Loads fonts (Inter, Poppins)
- Wraps all pages

#### `src/app/dashboard/layout.tsx` (Dashboard Layout)
- Authentication checking
- User state management
- Header and Footer
- OAuth callback handling

#### `src/components/Header.tsx`
- Navigation menu
- User dropdown
- Logout functionality
- Mobile responsive menu

## Routing Patterns

### Public Routes
- `/` - Landing page
- `/login` - Login page
- `/signup` - Signup page
- `/device-auth` - Device authentication

### Protected Routes (requires auth)
- `/dashboard` - Dashboard home (redirects to /dashboard/nodes)
- `/dashboard/nodes` - Node management
- `/dashboard/api-keys` - API key management
- `/dashboard/pat-tokens` - Personal Access Token management
- `/dashboard/webhooks` - Webhook management
- `/dashboard/monitoring` - System monitoring
- `/dashboard/rate-limiting` - Rate limit configuration
- `/dashboard/settings` - Settings
- `/dashboard/profile` - User profile

### API Routes
- `/auth/github/callback` - GitHub OAuth callback handler

## Data Flow

### Authentication
1. User clicks "Login with GitHub"
2. Redirects to GitHub OAuth page
3. GitHub redirects to `/auth/github/callback?code=...`
4. API route exchanges code for token
5. Fetches user data from GitHub
6. Stores in localStorage as `github_user`
7. Redirects to `/dashboard?user=...`
8. Dashboard layout reads user data and sets state

### Component Rendering
1. Next.js receives route request
2. Loads layout (with providers)
3. Executes page wrapper (src/app/*/page.tsx)
4. Imports actual component (src/pages/*.tsx)
5. Renders component with data
6. Client-side hydration

## Styling System

### Tailwind CSS
- Utility-first CSS framework
- Custom design tokens in `tailwind.config.ts`
- Dark mode support via `next-themes`

### CSS Variables
- Defined in `src/index.css`
- HSL color format
- Semantic naming (primary, secondary, accent, etc.)

### Component Styling
- shadcn/ui components: Pre-styled with Tailwind
- Custom components: Tailwind utilities
- Variants: class-variance-authority (cva)

## State Management

### Local State
- React useState for component state
- useEffect for side effects

### Server State
- TanStack Query (@tanstack/react-query)
- QueryClientProvider in root layout

### Global State
- User authentication: localStorage
- Toast notifications: useToast hook
- Theme: next-themes

## Development Workflow

1. **Start dev server:** `bun dev`
2. **Make changes:** Edit files in src/
3. **Hot reload:** Next.js Turbopack auto-reloads
4. **Check types:** TypeScript checks on save
5. **Test:** Manual testing in browser
6. **Lint:** `bun run lint`
7. **Build:** `bun build`

## Production Build

### Build Process
```bash
bun build
```

**Build Steps:**
1. TypeScript compilation
2. Route collection (App Router + Pages Router)
3. Static page generation
4. Bundle optimization
5. Asset generation

**Output Structure:**
```
.next/
├── static/          # Static assets and chunks
├── server/          # Server-side code
│   ├── app/         # App Router pages
│   └── pages/       # Legacy Pages Router
└── trace            # Build performance data
```

### Dynamic Rendering

All dashboard pages are configured with:
```tsx
export const dynamic = 'force-dynamic';
```

This prevents static generation and ensures:
- Authentication checks work correctly
- Client-side only features (localStorage, window) are available
- No SSR/hydration issues

### Build Fixes Applied

1. **Replaced useSearchParams with window.location**
    - Avoids SSR issues during build
    - Works for client-side only pages

2. **Fixed Component Props**
    - BulkActionsBar, NodeCard, ShareManagementDialog
    - Aligned with actual component interfaces

3. **Removed Unused Files**
    - DashboardLayout.tsx.bak (superseded by app/dashboard/layout.tsx)
