create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  timezone text not null default 'UTC',
  onboarding_complete boolean not null default false,
  personal_goals text,
  fitness_goals text,
  financial_goals text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  accent_color text not null default '#5b82ed',
  currency text not null default 'INR',
  date_format text not null default 'DD/MM/YYYY',
  week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  time_format text not null default '24h' check (time_format in ('12h', '24h')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  area text not null default 'Personal' check (area in ('Personal', 'Professional', 'Fitness', 'Finance')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'cancelled')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  due_date timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'on_hold', 'completed', 'archived')),
  start_date date,
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  title text not null,
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, project_id) references public.projects(user_id, id) on delete cascade
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  area text not null default 'Personal' check (area in ('Personal', 'Professional', 'Fitness', 'Finance')),
  description text,
  target_value numeric(14,2),
  current_value numeric(14,2) not null default 0,
  target_date date,
  status text not null default 'active' check (status in ('active', 'completed', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.goal_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null,
  title text not null,
  target_value numeric(14,2),
  target_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, goal_id) references public.goals(user_id, id) on delete cascade
);

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  frequency text not null default 'daily' check (frequency in ('daily', 'weekly')),
  reminder_time time,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.habit_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null,
  completed_on date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, habit_id, completed_on),
  foreign key (user_id, habit_id) references public.habits(user_id, id) on delete cascade
);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null default '',
  entry_date date not null default current_date,
  mood text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.mood_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mood text not null,
  intensity smallint check (intensity between 1 and 10),
  note text,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text,
  proficiency smallint check (proficiency between 0 and 100),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company text not null,
  role text not null,
  status text not null default 'applied' check (status in ('saved', 'applied', 'interview', 'offer', 'rejected')),
  applied_on date,
  follow_up_on date,
  url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  title text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, project_id) references public.projects(user_id, id) on delete set null (project_id)
);

create table if not exists public.fitness_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  height_cm numeric(5,2),
  target_weight_kg numeric(5,2),
  daily_calorie_target integer,
  daily_water_target_ml integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weight_kg numeric(5,2) not null check (weight_kg > 0),
  recorded_on date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  muscle_group text,
  equipment text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.workout_routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.workout_routine_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  routine_id uuid not null,
  exercise_id uuid not null,
  sets integer check (sets > 0),
  reps integer check (reps > 0),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, routine_id) references public.workout_routines(user_id, id) on delete cascade,
  foreign key (user_id, exercise_id) references public.exercises(user_id, id) on delete cascade
);

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  routine_id uuid,
  title text not null,
  started_at timestamptz not null default now(),
  duration_minutes integer check (duration_minutes >= 0),
  calories_burned integer check (calories_burned >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, routine_id) references public.workout_routines(user_id, id) on delete set null (routine_id)
);

create table if not exists public.workout_session_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  exercise_id uuid,
  exercise_name text not null,
  sets integer,
  reps integer,
  weight_kg numeric(7,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, session_id) references public.workout_sessions(user_id, id) on delete cascade,
  foreign key (user_id, exercise_id) references public.exercises(user_id, id) on delete set null (exercise_id)
);

create table if not exists public.nutrition_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  calories integer check (calories >= 0),
  protein_g numeric(7,2),
  carbohydrates_g numeric(7,2),
  fat_g numeric(7,2),
  consumed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.water_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_ml integer not null check (amount_ml > 0),
  consumed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'checking' check (type in ('checking', 'savings', 'cash', 'investment', 'credit')),
  currency text not null default 'INR',
  opening_balance numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.transaction_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name, type),
  unique (user_id, id)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid,
  category_id uuid,
  title text not null,
  amount numeric(14,2) not null check (amount >= 0),
  type text not null check (type in ('income', 'expense')),
  transaction_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, account_id) references public.financial_accounts(user_id, id) on delete set null (account_id),
  foreign key (user_id, category_id) references public.transaction_categories(user_id, id) on delete set null (category_id)
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid,
  name text not null,
  amount numeric(14,2) not null check (amount > 0),
  period text not null default 'monthly' check (period in ('weekly', 'monthly', 'yearly')),
  starts_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, category_id) references public.transaction_categories(user_id, id) on delete set null (category_id)
);

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(14,2) not null check (target_amount > 0),
  current_amount numeric(14,2) not null default 0 check (current_amount >= 0),
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.savings_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  savings_goal_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  contributed_on date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, savings_goal_id) references public.savings_goals(user_id, id) on delete cascade
);

create table if not exists public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  amount numeric(14,2) not null check (amount >= 0),
  type text not null check (type in ('income', 'expense')),
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  next_due date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  area text not null default 'Personal' check (area in ('Personal', 'Professional', 'Fitness', 'Finance')),
  reminder_minutes integer check (reminder_minutes >= 0),
  recurrence text not null default 'none' check (recurrence in ('none', 'daily', 'weekly', 'monthly', 'yearly')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  type text not null default 'reminder',
  scheduled_for timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  in_app_enabled boolean not null default true,
  browser_enabled boolean not null default false,
  telegram_enabled boolean not null default false,
  reminder_minutes integer not null default 15 check (reminder_minutes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.telegram_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  chat_id text not null,
  is_enabled boolean not null default false,
  last_tested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.telegram_delivery_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_id uuid,
  status text not null check (status in ('sent', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.telegram_rate_limits (
  id uuid not null default gen_random_uuid() unique,
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  scheduled_for timestamptz not null,
  notification_id uuid references public.notifications(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_type, source_id, scheduled_for)
);

create or replace function public.refresh_savings_goal_total()
returns trigger language plpgsql as $$
declare
  goal_user_id uuid;
  goal_id uuid;
begin
  if tg_op <> 'INSERT' then
    update public.savings_goals
    set current_amount = coalesce((
      select sum(amount) from public.savings_contributions
      where user_id = old.user_id and savings_goal_id = old.savings_goal_id
    ), 0)
    where user_id = old.user_id and id = old.savings_goal_id;
  end if;
  if tg_op <> 'DELETE' then
    update public.savings_goals
    set current_amount = coalesce((
      select sum(amount) from public.savings_contributions
      where user_id = new.user_id and savings_goal_id = new.savings_goal_id
    ), 0)
    where user_id = new.user_id and id = new.savings_goal_id;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists savings_contributions_refresh_total on public.savings_contributions;
create trigger savings_contributions_refresh_total
after insert or update or delete on public.savings_contributions
for each row execute function public.refresh_savings_goal_total();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'user_preferences', 'tasks', 'projects', 'project_milestones',
    'goals', 'goal_milestones', 'habits', 'habit_completions', 'journal_entries',
    'mood_entries', 'skills', 'job_applications', 'time_entries', 'fitness_profiles',
    'weight_entries', 'exercises', 'workout_routines', 'workout_routine_exercises',
    'workout_sessions', 'workout_session_exercises', 'nutrition_entries', 'water_entries',
    'financial_accounts', 'transaction_categories', 'transactions', 'budgets',
    'savings_goals', 'savings_contributions', 'recurring_transactions', 'calendar_events',
    'notifications', 'notification_preferences', 'telegram_connections', 'telegram_delivery_log',
    'reminder_deliveries'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_owner_access', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      table_name || '_owner_access', table_name
    );
    execute format('drop trigger if exists %I on public.%I', table_name || '_set_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      table_name || '_set_updated_at', table_name
    );
    execute format('create index if not exists %I on public.%I(user_id, created_at desc)', table_name || '_user_created_idx', table_name);
  end loop;
end;
$$;

alter table public.telegram_rate_limits enable row level security;
revoke all on public.telegram_rate_limits from anon, authenticated;

create index if not exists tasks_user_due_idx on public.tasks(user_id, due_date);
create index if not exists tasks_user_status_idx on public.tasks(user_id, status);
create index if not exists transactions_user_date_idx on public.transactions(user_id, transaction_date);
create index if not exists calendar_events_user_start_idx on public.calendar_events(user_id, starts_at);
create index if not exists notifications_user_read_idx on public.notifications(user_id, read_at, created_at desc);
create index if not exists habit_completions_user_day_idx on public.habit_completions(user_id, completed_on);
create index if not exists weight_entries_user_day_idx on public.weight_entries(user_id, recorded_on);

create or replace function public.handle_new_lifeos_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (user_id) do nothing;
  insert into public.user_preferences(user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  insert into public.notification_preferences(user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_lifeos on auth.users;
create trigger on_auth_user_created_lifeos
after insert on auth.users
for each row execute procedure public.handle_new_lifeos_user();

insert into public.profiles(user_id, display_name)
select id, coalesce(raw_user_meta_data ->> 'display_name', '')
from auth.users
on conflict (user_id) do nothing;

insert into public.user_preferences(user_id)
select id from auth.users
on conflict (user_id) do nothing;

insert into public.notification_preferences(user_id)
select id from auth.users
on conflict (user_id) do nothing;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('lifeos-private', 'lifeos-private', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "lifeos private objects owner select" on storage.objects;
create policy "lifeos private objects owner select" on storage.objects for select to authenticated
using (bucket_id = 'lifeos-private' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "lifeos private objects owner insert" on storage.objects;
create policy "lifeos private objects owner insert" on storage.objects for insert to authenticated
with check (bucket_id = 'lifeos-private' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "lifeos private objects owner update" on storage.objects;
create policy "lifeos private objects owner update" on storage.objects for update to authenticated
using (bucket_id = 'lifeos-private' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'lifeos-private' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "lifeos private objects owner delete" on storage.objects;
create policy "lifeos private objects owner delete" on storage.objects for delete to authenticated
using (bucket_id = 'lifeos-private' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.claim_telegram_rate_limit(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed boolean;
begin
  insert into public.telegram_rate_limits(user_id, window_started_at, request_count)
  values (p_user_id, now(), 1)
  on conflict (user_id) do update
  set window_started_at = case
        when public.telegram_rate_limits.window_started_at < now() - interval '1 minute' then now()
        else public.telegram_rate_limits.window_started_at
      end,
      request_count = case
        when public.telegram_rate_limits.window_started_at < now() - interval '1 minute' then 1
        else public.telegram_rate_limits.request_count + 1
      end,
      updated_at = now();
  select request_count <= 5 into allowed
  from public.telegram_rate_limits where user_id = p_user_id;
  return allowed;
end;
$$;

revoke all on function public.claim_telegram_rate_limit(uuid) from public, anon, authenticated;
grant execute on function public.claim_telegram_rate_limit(uuid) to service_role;
