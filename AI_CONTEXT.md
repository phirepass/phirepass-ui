# AI Assistant Context Guide

> This document provides essential context for AI assistants working on this codebase.

## Critical Information

### ⚠️ Important Warnings

1. **DO NOT DELETE `src/pages/` directory**
    - Contains ALL actual page components and business logic
    - `src/app/` contains only routing wrappers that import from `src/pages/`
    - This is NOT the Next.js pages directory (we use App Router)

2. **Next.js Router API Differences**
    - ❌ `router.push(path, { replace: true })` - WRONG
    - ✅ `router.replace(path)` - CORRECT
    - ❌ `const [searchParams, setSearchParams] = useSearchParams()` - WRONG
    - ✅ `const searchParams = useSearchParams()` - CORRECT (read-only)
    - Always use optional chaining: `searchParams?.get("param")`

3. **Link Component**
    - ❌ `<Link to="/path">` - React Router (OLD)
    - ✅ `<Link href="/path">` - Next.js (CORRECT)

4. **Environment Variables**
    - ❌ `import.meta.env.VITE_*` - Vite (OLD)
    - ✅ `process.env.NEXT_PUBLIC_*` - Next.js (CORRECT)

## Project Quick Reference

### Tech Stack
- **Framework:** Next.js 16.1.1 (App Router with Turbopack)
- **Language:** TypeScript 5.8.3
- **Runtime:** Bun
- **UI:** React 18.3.1 + Tailwind CSS + shadcn/ui
- **State:** TanStack Query
- **Auth:** GitHub OAuth 2.0
- **Dev Port:** 8084

### File Structure Logic

```
src/app/          ← Next.js routing (thin wrappers)
src/pages/        ← Real components (business logic)
src/components/   ← Reusable UI components
  └── ui/         ← shadcn/ui components
src/data/         ← Mock data
src/types/        ← TypeScript types
```

### Common Patterns

#### Page Component Wrapper
```tsx
// src/app/dashboard/nodes/page.tsx
'use client';
import Nodes from "@/pages/Nodes";

export default function NodesPage() {
    return <Nodes />;
}
```

#### API Route
```typescript
// src/app/auth/github/callback/route.ts
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    // ... handle OAuth
    return Response.redirect(`/dashboard?user=${encodeURIComponent(JSON.stringify(userData))}`);
}
```

#### Authentication Check
```tsx
useEffect(() => {
    const user = localStorage.getItem("github_user");
    if (!user) {
        router.replace("/login");
    }
}, [router]);
```

#### Toast Notification
```tsx
const { toast } = useToast();

toast({
    title: "Success",
    description: "Action completed",
    variant: "default", // or "destructive"
});
```

## Common Tasks

### Adding a New Page

1. Create component in `src/pages/NewPage.tsx`
2. Create wrapper in `src/app/new-page/page.tsx`
3. Add to navigation if needed in `src/components/Header.tsx`

### Adding a New Component

1. Create in `src/components/ComponentName.tsx`
2. Import where needed
3. Follow existing component patterns

### Adding shadcn/ui Component

```bash
npx shadcn@latest add <component-name>
```

### Fixing Hydration Errors

Move localStorage/window access from useState initializer to useEffect:

```tsx
// ❌ BAD - Causes hydration mismatch
const [user, setUser] = useState(() => {
    return localStorage.getItem("user");
});

// ✅ GOOD - Avoids hydration mismatch
const [user, setUser] = useState(null);
useEffect(() => {
    setUser(localStorage.getItem("user"));
}, []);
```

## Authentication Flow

### Login Process
1. User clicks "Login with GitHub" in Login.tsx
2. Redirects to GitHub OAuth: `https://github.com/login/oauth/authorize?client_id=...`
3. GitHub redirects to `/auth/github/callback?code=...`
4. API route (`src/app/auth/github/callback/route.ts`) exchanges code for token
5. Fetches user from GitHub API
6. Redirects to `/dashboard?user=...`
7. Dashboard layout stores user in localStorage
8. User is authenticated

### Logout Process
1. User clicks logout in Header
2. `handleLogout()` clears localStorage
3. Shows logout toast
4. Redirects to `/login`

## Navigation Structure

### Public Routes
- `/` - Landing page
- `/login` - Login
- `/signup` - Signup
- `/device-auth` - Device auth

### Protected Routes (require auth)
- `/dashboard` → redirects to `/dashboard/nodes`
- `/dashboard/nodes` - Node management
- `/dashboard/api-keys` - API keys
- `/dashboard/webhooks` - Webhooks
- `/dashboard/monitoring` - Monitoring
- `/dashboard/rate-limiting` - Rate limits
- `/dashboard/settings` - Settings
- `/dashboard/profile` - Profile

## Environment Variables

Required in `.env.local`:
```env
NEXT_PUBLIC_GITHUB_CLIENT_ID=Ov23lixQs35iMlLB9cBc
GITHUB_CLIENT_SECRET=<secret>
NEXT_PUBLIC_API_URL=http://localhost:8084
```

## Component Libraries Used

### shadcn/ui Components
Located in `src/components/ui/`:
- accordion, alert, alert-dialog
- avatar, badge, breadcrumb
- button, calendar, card, carousel, chart
- checkbox, collapsible, command
- context-menu, dialog, drawer
- dropdown-menu, form, hover-card
- input, input-otp, label
- menubar, navigation-menu
- pagination, popover, progress
- radio-group, resizable, scroll-area
- select, separator, sheet, sidebar
- skeleton, slider, switch
- table, tabs, textarea
- toast, toaster, tooltip

### Radix UI (Primitives)
All shadcn/ui components are built on Radix UI primitives.

### Icons
- **lucide-react** - Icon library

## Known Issues & Quirks

### 1. DashboardLayout.tsx in src/pages/
- File exists but NOT used
- Superseded by `src/app/dashboard/layout.tsx`
- Can be deleted but kept for reference

### 2. OAuth Callback Port
- Must use `request.url` origin, not env variable
- Original bug: hardcoded port mismatch

### 3. SearchParams Typing
- Can be `null` in some cases
- Always use optional chaining: `searchParams?.get()`

### 4. Router Push/Replace
- No options object support
- Use separate methods: `router.push()` vs `router.replace()`

### 5. Production Build Issues

**useSearchParams SSR Problem:**
```tsx
// ❌ BAD - Causes SSR errors during build
const searchParams = useSearchParams();
const code = searchParams?.get('code');

// ✅ GOOD - Use window.location for client-side only
const [code, setCode] = useState('');
useEffect(() => {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    setCode(params.get('code') || '');
  }
}, []);
```

**Dynamic Rendering:**
Add to pages that need client-side rendering:
```tsx
export const dynamic = 'force-dynamic';
```

## Data Patterns

### Current (Mock Data)
```tsx
import { nodes } from "@/data/mockNodes";

function NodesPage() {
    const [filteredNodes, setFilteredNodes] = useState(nodes);
    // ...
}
```

### Future (API Integration)
```tsx
import { useQuery } from "@tanstack/react-query";

function NodesPage() {
    const { data: nodes, isLoading } = useQuery({
        queryKey: ['nodes'],
        queryFn: () => fetch('/api/nodes').then(r => r.json())
    });
    // ...
}
```

## Styling Guidelines

### Tailwind Utility Pattern
```tsx
<div className="flex items-center justify-between p-4 rounded-lg border bg-card">
    <h2 className="text-lg font-semibold">Title</h2>
</div>
```

### Using cn() Utility
```tsx
import { cn } from "@/lib/utils";

<div className={cn(
    "base-classes",
    condition && "conditional-class",
    className // props
)} />
```

### Responsive Design
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
```

## TypeScript Types

### Common Types
Located in `src/types/`:
- `node.ts` - Node interface
- `tunnel.ts` - Tunnel types
- `webhook.ts` - Webhook types
- `api-key.ts` - API key types
- `rate-limit.ts` - Rate limit types
- `ssh-tunnel.ts` - SSH tunnel types
- `tcp-tunnel.ts` - TCP tunnel types

### Type Import Pattern
```tsx
import { Node } from "@/types/node";
import { Webhook } from "@/types/webhook";
```

## Development Commands

```bash
bun dev              # Start dev server (port 8084)
bun build            # Build production bundle
bun start            # Start production server
bun run lint         # Run ESLint
bun run lint --fix   # Fix linting issues
```

## Debugging Tips

### React DevTools
- Inspect component tree
- View props and state
- Profile performance

### Console Errors
- Check browser console for errors
- Network tab for API calls
- React errors often show file/line

### Common Error Messages

**"Object literal may only specify known properties"**
- Usually router.push with options object
- Fix: Use router.replace() instead

**"'searchParams' is possibly 'null'"**
- Fix: Add optional chaining `searchParams?.get()`

**"Hydration mismatch"**
- Fix: Move browser APIs (localStorage, window) to useEffect

**"Cannot read properties of undefined"**
- Fix: Add optional chaining or null checks

**"useSearchParams() should be wrapped in a suspense boundary"**
- Occurs during production build
- Fix: Replace with window.location.search or add `export const dynamic = 'force-dynamic'`

**"Type 'X' is not assignable to type 'IntrinsicAttributes & XProps'"**
- Component props mismatch
- Fix: Check component prop interface and update usage

**"localStorage is not defined"**
- Trying to access localStorage during SSR
- Fix: Wrap in `typeof window !== 'undefined'` check

## Code Style

### EditorConfig Settings
- Indent: 4 spaces
- Line endings: LF
- Charset: UTF-8
- Trim trailing whitespace: yes
- Final newline: yes

### Naming Conventions
- Components: PascalCase (`NodeCard.tsx`)
- Files: PascalCase for components, camelCase for utils
- Functions: camelCase
- Constants: UPPER_SNAKE_CASE
- Types: PascalCase

## Testing (Future)

### Recommended Setup
```bash
bun add -d vitest @testing-library/react @testing-library/jest-dom
bun add -d @playwright/test
```

## Deployment Notes

### Build Output
- `.next/` directory created by `bun build`
- Contains optimized bundles and server functions
- Do not commit `.next/` directory

### Environment Variables in Production
- Set in deployment platform (Vercel, etc.)
- Never commit `.env.local`
- GitHub client secret must be server-side only

## Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [shadcn/ui Components](https://ui.shadcn.com)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [TanStack Query](https://tanstack.com/query/latest)

## Migration History

See `MIGRATION_HISTORY.md` for detailed migration information from Vite + React Router to Next.js.

## Questions to Ask User

When uncertain, consider asking:
- "Should this be a server or client component?"
- "Do you want to replace the mock data with API calls?"
- "Should this route be protected (require auth)?"
- "What error handling do you prefer?"
- "Should this be responsive for mobile?"
