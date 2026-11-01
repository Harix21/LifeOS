# LifeOS master-requirements checklist

Status is based on the checked-in source, not a claim that an unconfigured hosted Supabase project has been tested. The workspace has no `.env` file or Supabase project credentials.

## Implemented in this workspace

- [x] TypeScript React application, Vite, React Router, TanStack Query, React Hook Form, Zod validation, Supabase client, Lucide icons, Recharts, date-fns, and responsive design tokens.
- [x] Protected authenticated workspace with email/password sign-up and sign-in, email verification messaging, password-reset email, password-update flow, persistent Supabase session, sign-out, and account onboarding.
- [x] Dedicated navigation for overview, personal, professional, fitness, finance, calendar, reports, notifications, and settings.
- [x] Supabase-backed create/read/update/delete surfaces for tasks, goals/milestones, habits/check-ins, journal/mood entries, projects/milestones, skills, job applications, time entries, fitness profiles, weight/exercise/routine/session/nutrition/water records, financial accounts/transactions/categories/budgets/savings/contributions/recurring records, calendar events, and notifications.
- [x] Database-generated profiles and preferences for new users; private profile-photo upload with MIME/size limits and Storage ownership policies.
- [x] Migration adds the listed domain tables, constraints, indexes, updated-at triggers, owner-only RLS policies, savings-contribution aggregation, private avatar Storage bucket, and server-side reminder rate limiting.
- [x] SQL catalog check at `supabase/tests/rls_check.sql` verifies required tables, standard ownership/audit columns, RLS policies, and private avatar bucket.
- [x] Dashboard values and report charts are queried from Supabase; empty-data views do not substitute illustrative values. Reports include task completion, area, weekday, time, finance, budget utilization, net-worth estimate from tracked accounts, weight, workout, nutrition, and goal-progress views with date filters.
- [x] Calendar month/week/day/agenda filters, date navigation, area filtering, create/edit/delete, recurrence display, and per-event reminders.
- [x] In-app notification history and mark-read actions; browser-notification permission and a local test notification.
- [x] Telegram and account-deletion Edge Functions validate the caller; Telegram delivery accepts only a caller-owned notification ID and saved chat ID, applies a server-side rate limit, and logs delivery status.
- [x] Scheduled Edge Function creates deduplicated in-app task, event, recurring-bill, and budget notifications; optional Telegram sends remain server-side.
- [x] Theme preference persistence, currency/date/week/time/accent settings, private CSV exports and all-record JSON export.
- [x] Offline indicator and shell/static-asset service worker; writes are not queued or described as synchronized while offline.
- [x] Responsive mobile navigation and forms, install manifest and app icon, SPA rewrite configuration for Vercel and Firebase.
- [x] No browser `alert`, `confirm`, or `prompt`; destructive actions use an in-app confirmation dialog.
- [x] Strict TypeScript check and Vite production build pass (see final task report).

## Incomplete or awaiting external setup

- [ ] **Database verification:** the workspace has no Supabase project credentials, and local migrations could not be started because Docker Desktop's Linux engine is unavailable. To run locally, start that engine and use `supabase start`, `supabase db reset`, and `supabase db query --local --file supabase/tests/rls_check.sql`. Live registration, recovery, CRUD persistence, Storage, and cross-user RLS denial still require a configured Supabase project and two real accounts.
- [ ] **Scheduled jobs:** deploy `scheduled-reminders` with `SCHEDULER_SECRET`; enable `pg_cron`, `pg_net`, and Vault; store the project URL and secret in Vault; create the minute-level cron job described in `README.md`. Until then, scheduled reminders are source-code only.
- [ ] **Telegram delivery:** provide a Telegram bot token as the Supabase Edge Function secret `TELEGRAM_BOT_TOKEN`, deploy `telegram-notify`, and enter a real user-owned chat ID. The UI explicitly reports that a saved ID alone does not verify delivery.
- [ ] **Account deletion deployment:** deploy `delete-account` so the settings action can call the authenticated server-side deletion path.
- [ ] **Production hosting:** configure a Vercel or Firebase project, provide the two public Vite environment variables at build time, and add the production URL to Supabase Auth redirects.

## Explicit scope gaps and implementation deviations

- [ ] Browser notifications are permission-gated local notifications only. Background Web Push/subscriptions and delivery while the app is closed need a push service and VAPID configuration; neither is configured here.
- [ ] Calendar drag-and-drop is not implemented. Calendar events can be created, edited, deleted, navigated, and repeated.
- [ ] Recurring financial entries generate reminders but do not automatically post transactions. This avoids silently creating financial records; users create/edit the resulting transaction explicitly.
- [ ] Receipt/document uploads are not implemented; the secured Storage path currently supports profile photos only.
- [ ] The project uses custom reusable UI components and token-based CSS rather than shadcn/ui primitives. The Vite PWA service worker is maintained directly rather than generated by the Vite PWA plugin.
- [ ] No automated browser or live database test suite existed in the starter. The browser smoke check covered the no-credentials setup page and a 390px mobile viewport; authenticated database flows require the external setup above.
