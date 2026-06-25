# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Mantenix** — project management and maintenance scheduling platform (Monday.com-style). Built for supervisors, coordinators, and field operators.

## Commands

```bash
npm run dev      # Dev server at http://localhost:3000
npm run build    # Production build
npm run lint     # ESLint
npm run test     # Jest (jsdom environment)
```

Run a single test file:
```bash
npx jest src/path/to/file.test.ts
```

## Stack

- **Next.js 16 + React 19** — App Router (all pages under `src/app/`)
- **TypeScript 5** — path alias `@/*` → `src/*`
- **Tailwind CSS 4** — utility-first, no component library
- **Supabase** — Postgres + Auth + Storage + Realtime
- **TanStack React Query 5** — all server state; stale time 60s, no refetch on focus
- **@dnd-kit** — drag-and-drop (Kanban, Gantt reordering)
- **Recharts** — charts and KPI visualizations
- **Google Gemini** — AI optimization (`@google/generative-ai`)

## Architecture

### Data Flow

```
Component
  └─ React Query hook (useBoardData, useBoardGroups, etc.)
       └─ navigator.onLine?
            ├─ YES → Supabase (src/lib/supabaseClient.ts)
            └─ NO  → IndexedDB snapshot (src/lib/offlineDB.ts)

Mutations (useBoardMutations)
  ├─ Online  → Supabase directly, invalidate query cache
  └─ Offline → queue in IndexedDB, auto-sync on reconnect (useOfflineSync)
```

### Offline-First Layer

`src/lib/offlineDB.ts` — `OfflineDB` class wraps IndexedDB:
- **Snapshot store**: tables (`boards`, `groups`, `items`, `site_incidents`, `board_columns`, `activity_templates`, `task_dependencies`)
- **Mutation queue**: pending insert/update/delete ops, replayed in order on reconnect (max 3 retries, 1.5 s delay, 30 s polling)

`src/lib/supabaseClient.ts` — exports a proxy client that routes to `OfflineDB` when offline.

### Views

The main dashboard (`src/app/dashboard/page.tsx`) renders a view based on URL query param:

| Param value | Component |
|---|---|
| board | `BoardViewContainer` |
| gantt | `GanttViewContainer` |
| execution | `ExecutionViewContainer` |
| financial | `FinancialViewContainer` |
| dashboard | `DashboardViewContainer` |
| kanban | `KanbanViewContainer` |
| reports | `ReportsViewContainer` |
| map | `MantenixMap` |
| notifications | `NotificationsView` |

Each view follows the pattern: `*Container` fetches data → passes props to a pure view component.

### Auth

- Supabase Auth (session-based)
- `src/contexts/AuthContext.tsx` — exposes `{ user, session, loading, isAdmin, signOut }`
- Role lives in `user.user_metadata.role` (`admin` | `member` | `viewer`)
- `isAdmin` is true when role is `admin` or email is `admin@mantenix.com`
- Wrap protected pages in `<ProtectedRoute>`

### State Management

| Concern | Mechanism |
|---|---|
| Server/async data | React Query (`src/hooks/`) |
| Auth state | `AuthContext` |
| UI toggles (sidebar, modals) | `UIContext` |
| Offline data | IndexedDB via `OfflineDB` |

### Key Hooks

- `useBoardData(boardId)` — board metadata + columns + groups + items
- `useBoardMutations(boardId)` — add/update/delete items, groups; triggers automations; handles task rescheduling on dependency change
- `useOfflineSync()` — syncs mutation queue on reconnect
- `useAutomations(boardId)` — automation rules (condition → action)
- `usePermissions()` — checks against `PERMISSIONS` enum using board member role

### Database

Migrations live in `supabase/migrations/`. Key tables:

| Table | Purpose |
|---|---|
| `boards` | Projects |
| `board_members` | Access control (role per user per board) |
| `board_columns` | Column schema (type, options, order) |
| `groups` | Sites / locations (color-coded, nested under board) |
| `items` | Tasks (parent-child nesting; `values` is JSONB) |
| `task_dependencies` | DAG of task relationships with lag days |
| `activity_templates` | Predefined activities (unit, rendimiento, price) |
| `personnel` | Workers / operators |
| `site_incidents` | Maintenance issues (severity, type, solution) |
| `financial_actas` | Progress billing headers |
| `financial_acta_details` | Billing line items |
| `activity_log` | Full audit trail |

RLS is enforced via `get_user_board_role(board_id, user_id)` — every table uses this to restrict reads and writes to board members.

### AI Integration

`src/services/ai/Optimizer.ts` — calls Gemini 3 Flash (fallback to 1.5) for prompt optimization. AI skills stored in `ai_skills` table. API key: `GEMINI_API_KEY` (server-side only).

## Environment Variables

| Variable | Where used |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client |
| `SUPABASE_SERVICE_ROLE_KEY` | API routes only |
| `GEMINI_API_KEY` | API routes only |

## Conventions

- **Types**: all core domain types in `src/types/monday.ts`
- **API routes**: under `src/app/api/` (log, ai, reports)
- **Tests**: colocated as `*.test.ts(x)` next to source files
- **Images**: must come from `azhkbijknwywpqtgknus.supabase.co` (configured in `next.config.mjs`)
- Always verify RLS exists before adding a new table — use `get_user_board_role` pattern from existing migrations
