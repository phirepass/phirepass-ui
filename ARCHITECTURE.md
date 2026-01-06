# Architecture Documentation

## Application Architecture

### Technology Stack

- **Framework:** Next.js 16.1.1 (App Router)
- **Runtime:** Node.js with Turbopack
- **Language:** TypeScript 5.8.3
- **Package Manager:** Bun
- **UI Library:** React 18.3.1
- **Styling:** Tailwind CSS 3.4.17
- **Component Library:** shadcn/ui (Radix UI primitives)
- **State Management:** TanStack Query 5.83.0
- **Authentication:** GitHub OAuth 2.0

### Architecture Pattern

#### Wrapper Pattern (Routing Layer)
The application uses a unique wrapper pattern to maintain compatibility with the original codebase:

```
┌─────────────────────┐
│   Next.js App       │
│   Router Layer      │  ← Thin wrappers, routing only
│   (src/app/)        │
└──────────┬──────────┘
            │ imports
            ↓
┌─────────────────────┐
│   Page Components   │
│   (src/pages/)      │  ← Business logic, UI, state
└─────────────────────┘
```

**Benefits:**
- Minimal code changes during migration
- Clear separation of routing and logic
- Easy to consolidate later if needed
- Preserves original component structure

#### Component Hierarchy

```
RootLayout (app/layout.tsx)
├─ QueryClientProvider
├─ TooltipProvider
├─ Toaster
└─ Children
    │
    ├─ Public Routes
    │   ├─ Landing (/)
    │   ├─ Login (/login)
    │   └─ Signup (/signup)
    │
    └─ Protected Routes (dashboard/layout.tsx)
        ├─ Header
        ├─ Dashboard (/dashboard)
        ├─ Nodes (/dashboard/nodes)
        ├─ API Keys (/dashboard/api-keys)
        ├─ Webhooks (/dashboard/webhooks)
        ├─ Monitoring (/dashboard/monitoring)
        ├─ Settings (/dashboard/settings)
        └─ Profile (/dashboard/profile)
```

### Authentication Architecture

#### OAuth 2.0 Flow

```
┌──────────┐         ┌──────────┐         ┌─────────────┐
│  Client  │         │  Server  │         │   GitHub    │
└────┬─────┘         └────┬─────┘         └──────┬──────┘
    │                    │                       │
    │ 1. Login button    │                       │
    ├───────────────────>│                       │
    │                    │                       │
    │ 2. Redirect to GitHub OAuth               │
    │────────────────────────────────────────────>
    │                    │                       │
    │ 3. User authorizes │                       │
    │<───────────────────────────────────────────┤
    │                    │                       │
    │ 4. Callback with code                     │
    ├────────────────────>                       │
    │                    │ 5. Exchange code      │
    │                    ├──────────────────────>│
    │                    │                       │
    │                    │ 6. Access token       │
    │                    │<──────────────────────┤
    │                    │ 7. Fetch user data    │
    │                    ├──────────────────────>│
    │                    │                       │
    │                    │ 8. User data          │
    │                    │<──────────────────────┤
    │ 9. Redirect with user                     │
    │<───────────────────┤                       │
    │                    │                       │
    │ 10. Store in localStorage                 │
    │                    │                       │
```

#### Authentication State Management

**Storage:**
- `localStorage.github_user` - User profile data
- `localStorage.access_token` - GitHub access token
- `sessionStorage.github_oauth_state` - OAuth state parameter

**State Flow:**
1. Dashboard layout checks localStorage on mount
2. If user exists, loads into state and renders
3. If OAuth callback, processes user data
4. If no user, redirects to login
5. On logout, clears all storage and redirects

**Security Considerations:**
- Client secret stored server-side only
- Access token in localStorage (client-side)
- No persistent sessions (localStorage-based)
- State parameter for CSRF protection

### Data Flow Architecture

#### Mock Data Pattern
Currently using mock data for demonstration:

```typescript
// src/data/mockNodes.ts
export const nodes: Node[] = [
    { id: "1", name: "Server 1", ... },
    { id: "2", name: "Server 2", ... },
];

// src/pages/Nodes.tsx
import { nodes } from "@/data/mockNodes";
```

**Future API Integration:**
```typescript
// Replace mock imports with API calls
const { data: nodes } = useQuery({
    queryKey: ['nodes'],
    queryFn: async () => {
        const res = await fetch('/api/nodes');
        return res.json();
    }
});
```

#### State Management Strategy

**Local State (useState):**
- Form inputs
- UI toggles (modals, dropdowns)
- Filter/search values
- Temporary component state

**Server State (TanStack Query):**
- API data fetching
- Caching and invalidation
- Loading and error states
- Background refetching

**Global State (Context/localStorage):**
- Authentication (localStorage)
- Theme preferences (next-themes)
- Toast notifications (Sonner)

### Styling Architecture

#### Tailwind CSS Design System

**Color Palette (CSS Variables):**
```css
--background: 0 0% 100%;
--foreground: 222.2 84% 4.9%;
--primary: 221.2 83.2% 53.3%;
--secondary: 210 40% 96.1%;
--accent: 210 40% 96.1%;
--destructive: 0 84.2% 60.2%;
```

**Responsive Breakpoints:**
- sm: 640px
- md: 768px
- lg: 1024px
- xl: 1280px
- 2xl: 1536px

**Component Styling Pattern:**
```tsx
import { cn } from "@/lib/utils";

export function Component({ className }) {
    return (
        <div className={cn(
            "base-styles",
            "responsive:md:styles",
            className // Allow override
        )}>
            ...
        </div>
    );
}
```

#### shadcn/ui Integration

**Component Source:**
- Components copied into `src/components/ui/`
- Full control over implementation
- Customizable via Tailwind utilities
- Based on Radix UI primitives

**Usage Pattern:**
```tsx
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

<Button variant="default" size="lg">
    Click me
</Button>
```

### Routing Architecture

#### File-Based Routing

**Convention:**
- `page.tsx` - Route component
- `layout.tsx` - Shared layout
- `route.ts` - API route handler
- `not-found.tsx` - 404 page
- `error.tsx` - Error boundary
- `loading.tsx` - Loading UI

**Route Groups:**
```
app/
├─ (auth)/          # Group without segment
│  ├─ login/
│  └─ signup/
└─ dashboard/       # Group with segment
    ├─ layout.tsx    # Shared layout
    └─ nodes/
```

#### Dynamic Routes

**Not yet implemented, but pattern would be:**
```
app/
└─ dashboard/
    └─ nodes/
    └─ [id]/
        └─ page.tsx  # /dashboard/nodes/123
```

### Error Handling

#### Client-Side Errors

**Toast Notifications:**
```tsx
const { toast } = useToast();

toast({
    title: "Error",
    description: "Failed to load data",
    variant: "destructive",
});
```

**Error Boundaries:**
- Next.js provides automatic error boundaries
- Can add custom error.tsx files per route

#### API Error Handling

**Pattern:**
```typescript
try {
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();
} catch (err) {
    console.error(err);
    toast({ title: "Error", variant: "destructive" });
}
```

### Performance Optimization

#### Next.js Turbopack
- Fast refresh during development
- Optimized bundling
- Code splitting by route
- Tree shaking

#### React Optimization
- Lazy loading (future enhancement)
- Memoization where needed
- Virtualization for long lists (future)

#### Image Optimization
- Use Next.js Image component (future)
- Automatic format optimization
- Lazy loading images

### Deployment Architecture

**Build Process:**
```bash
bun build           # Next.js production build
```

**Output:**
- `.next/` directory
- Optimized bundles
- Static assets
- Server functions

**Build Configuration:**
- All dashboard pages use `export const dynamic = 'force-dynamic'`
- Prevents static generation for pages with authentication
- Ensures proper SSR for pages with search params

**Deployment Options:**
- Vercel (recommended for Next.js)
- Docker container
- Node.js server
- Static export (NOT recommended due to dynamic routes)

### SSR and Client-Side Rendering

**SSR Considerations:**
- `localStorage` access must be wrapped in `typeof window !== 'undefined'` checks
- `window.location` APIs only available client-side
- `useSearchParams()` requires Suspense or replaced with window.location for static generation

**Pattern for Client-Side Only Code:**
```tsx
const [data, setData] = useState(null);

useEffect(() => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('key');
    const params = new URLSearchParams(window.location.search);
    setData({ stored, params });
  }
}, []);
```

**Dynamic Rendering:**
Pages that require client-side only features should export:
```tsx
export const dynamic = 'force-dynamic';
```

### Type Safety

#### TypeScript Configuration

**Strict Mode:**
- `strict: true`
- Type checking enabled
- No implicit any
- Null checks

**Type Organization:**
```typescript
// src/types/node.ts
export interface Node {
    id: string;
    name: string;
    status: "active" | "inactive" | "error";
    // ...
}

// Usage
import { Node } from "@/types/node";
```

#### Type Inference
- Props automatically typed
- Hook return types inferred
- Event handlers typed

### Testing Strategy (Future)

**Recommended Setup:**
- Unit tests: Vitest or Jest
- Component tests: React Testing Library
- E2E tests: Playwright
- Type checking: tsc --noEmit

### Monitoring & Logging

**Current:**
- Console logs for debugging
- Browser DevTools

**Future Enhancements:**
- Error tracking (Sentry)
- Analytics (Vercel Analytics)
- Performance monitoring
- User behavior tracking

### Security Considerations

**Current Implementation:**
- GitHub OAuth for authentication
- HTTPS required in production
- Environment variables for secrets
- localStorage for tokens (consider alternatives)

**Security Improvements Needed:**
- HTTP-only cookies for tokens
- CSRF protection
- Rate limiting
- Input sanitization
- XSS prevention (React provides by default)

### Scalability Considerations

**Current State:**
- Single-page application
- Client-side rendering
- Mock data

**Future Scaling:**
- API routes for backend logic
- Database integration
- Caching strategy (Redis)
- CDN for static assets
- Load balancing
- Horizontal scaling
