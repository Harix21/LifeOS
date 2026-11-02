# LifeOS

LifeOS is a personal management workspace for tasks, goals, habits, journal entries, professional projects, fitness, finances, calendar events, notifications, and reports. Real user data is stored in Supabase and protected with row-level security. A read-only demo workspace provides sample records without connecting to or changing a real account.

## Requirements

- Node.js 20 or newer
- npm
- A Supabase project for sign-in and database-backed features
- Supabase CLI for applying migrations and deploying Edge Functions
- Docker Desktop with its Linux engine running to start the optional local Supabase stack

## Local development

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` and set the public Supabase project URL and anon/publishable key:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
   ```

   Never place a service-role key or a Telegram bot token in a `VITE_` variable.

3. Link the Supabase CLI to your project and apply migrations:

   ```sh
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

   `supabase db push` applies the migrations in order. `0002_lifeos_modules.sql` adds profiles and preferences, all management-module tables, RLS policies and indexes, profile onboarding, a private avatar bucket, and reminder support. `0003_habit_appearance.sql` adds each habit's saved icon and color. `0004_daily_journal_loans.sql` adds private borrowed/lent balances and the per-user journal theme and automatic-activity settings. `0005_journal_ebook.sql` stores per-user journal cover and profile-page customizations. `0010_link_loans_to_transactions.sql` links loans to their originating transactions for person-level tracking.

   To validate migrations locally instead, start Docker Desktop's Linux engine and run:

   ```sh
   supabase start
   supabase db reset
   supabase db query --local --file supabase/tests/rls_check.sql
   ```

4. In Supabase Authentication, configure the site URL and redirect allow-list for `http://localhost:5173` and your deployed origin. Set email verification and password-reset email delivery to match your project’s SMTP configuration.

5. Start the development server:

   ```sh
   npm run dev
   ```

With missing Supabase environment variables, LifeOS shows a setup screen with an option to explore the read-only demo. When Supabase is configured, the sign-in screen also offers the demo. Demo state is kept in the current browser and uses generated sample records; changes are disabled and no demo data is written to Supabase. An authenticated new user receives a profile and default preferences from the database trigger and is prompted to finish onboarding.

## Commands

```sh
npm run typecheck
npm run build
npm run preview
```

`npm run build` runs the strict TypeScript check before producing the production Vite build.

## Supabase security and data

- Use only the project URL and anon/publishable key in the browser.
- `0002_lifeos_modules.sql` enables RLS and applies owner-only policies to user-owned module tables. The client also scopes queries and mutations by the authenticated user ID; database RLS is the security boundary.
- The `lifeos-private` Storage bucket is private. Profile photos are restricted to JPEG, PNG, or WebP and 5 MB; object policies restrict reads and writes to the authenticated user’s folder.
- The app has no offline write queue. It disables or rejects mutations while the browser is offline and never reports that an unsynchronized write succeeded.
- Verify RLS in your Supabase project with two separate test accounts before production use. This workspace has no project credentials, and the local Supabase stack could not start because the Docker Linux engine is unavailable. Migration execution, authentication, cross-user policy behavior, Storage, and database CRUD therefore remain unverified here.

## Telegram and scheduled reminders

Telegram tokens must be stored as Supabase Edge Function secrets, never in the browser:

```sh
supabase secrets set TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN
supabase functions deploy telegram-notify
supabase functions deploy delete-account
```

The authenticated `telegram-notify` function accepts only an ID for a notification owned by the caller, sends only to that user’s saved Telegram chat ID, rate-limits requests, and records delivery outcomes. The `delete-account` function validates the caller’s access token before using the server-side service-role key to delete that same user.

For scheduled task, event, and recurring-bill reminders, set a long random scheduler secret and deploy the cron endpoint without gateway JWT validation; the function validates the secret itself:

```sh
supabase secrets set SCHEDULER_SECRET=GENERATE_A_LONG_RANDOM_SECRET
supabase functions deploy scheduled-reminders --no-verify-jwt
```

To invoke it every minute, enable `pg_cron`, `pg_net`, and Vault in the Supabase project. Store the project URL and the same random scheduler secret in Vault (do not commit them or hard-code them in a migration), then schedule a `net.http_post` to:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/scheduled-reminders
```

In the Supabase SQL Editor, store the project URL and the exact `SCHEDULER_SECRET` value used above in Vault, then create the cron job:

```sql
select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'lifeos_project_url');
select vault.create_secret('PASTE_THE_SCHEDULER_SECRET_VALUE', 'lifeos_scheduler_secret');

select cron.schedule(
  'lifeos-reminders-every-minute',
  '* * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'lifeos_project_url')
        || '/functions/v1/scheduled-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' ||
          (select decrypted_secret from vault.decrypted_secrets where name = 'lifeos_scheduler_secret')
      ),
      body := '{}'::jsonb
    );
  $job$
);
```

Replace the placeholder values in the SQL Editor only; never commit them. Send an empty JSON body. The endpoint creates deduplicated in-app notifications for due tasks, calendar events with reminders, and recurring transactions. If `TELEGRAM_BOT_TOKEN` is configured and the user enabled Telegram, it also sends the notification to the user’s saved chat ID. Scheduled browser push is not implemented; browser notifications are permission-gated local notifications and a test action.

The Telegram test action requires a real bot token, a reachable chat ID, and the deployed function. A saved chat ID alone does not mean delivery has been verified.

Run `supabase/tests/rls_check.sql` in the Supabase SQL Editor after applying migrations. It verifies the required user-owned tables, RLS owner policies, standard audit columns, and the private Storage bucket. Test actual cross-user denial with two separate authenticated Supabase accounts; catalog checks are not a substitute for those live tests.

## Deployment

### Vercel

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel project’s environment variables, then deploy. `vercel.json` includes the SPA fallback. Add the deployed origin to Supabase Authentication’s redirect allow-list.

### Firebase Hosting

Build and deploy:

```sh
npm run build
firebase deploy --only hosting
```

`firebase.json` serves `dist`, rewrites client-side routes to `index.html`, and avoids long-lived caching of the service worker. Configure Firebase CLI/project access and the same Vite environment variables at build time.

## PWA and offline behavior

The web manifest, application icon, and service worker live in `public/`. The service worker caches the app shell and static assets only; Supabase API responses and writes are never cached. The app remains shell-accessible offline and shows an offline indicator. Data queries still require the Supabase connection.

## Implemented modules

The main navigation stays focused on the main dashboard, Personal, Fitness, Finance, Projects, Journal, Calendar, Analytics, and Settings. Personal, Fitness, Finance, and Projects each have a dedicated component folder with an independent workspace shell, navigation, responsive layout, and visual design. Existing records and dashboard logic are reused inside each workspace. The Today page summarizes tasks, habits, water, nutrition, transactions, savings, budgets, job follow-ups, workouts, and events for a selected date and the following day. Habit check-ins can be reviewed and recorded from the monthly habit calendar. Finance has a daily/monthly dashboard and owner-only borrowed/lent balances. Record forms keep required fields up front and group optional details, while searchable logs support recent-activity sorting and expandable record details. Page transitions, dashboard cards, record lists, and forms use restrained animations with reduced-motion support. The journal includes a customizable cover, ten numbered opening profile pages before dated entries, collapsible opening pages, and an exportable standalone HTML e-book that can be printed to PDF. Journal pages combine an editable reflection with live links to the activity types selected in Settings; activity is not copied into duplicate journal records.
#   L i f e O S  
 