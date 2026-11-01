alter table public.user_preferences
  add column if not exists journal_theme text not null default 'midnight'
    check (journal_theme in ('paper', 'midnight', 'sage', 'lavender')),
  add column if not exists journal_data_types text[] not null default array[
    'tasks', 'habits', 'water', 'nutrition', 'transactions', 'savings',
    'budgets', 'calendar', 'workouts', 'mood'
  ]::text[]
    check (journal_data_types <@ array[
      'tasks', 'habits', 'water', 'nutrition', 'transactions', 'savings',
      'budgets', 'calendar', 'workouts', 'mood'
    ]::text[]);

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_name text not null,
  direction text not null check (direction in ('borrowed', 'lent')),
  amount numeric(14,2) not null check (amount > 0),
  loan_date date not null default current_date,
  due_date date,
  is_settled boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or due_date >= loan_date)
);

alter table public.loans enable row level security;
drop policy if exists loans_owner_access on public.loans;
create policy loans_owner_access on public.loans for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
grant select, insert, update, delete on public.loans to authenticated;

drop trigger if exists loans_set_updated_at on public.loans;
create trigger loans_set_updated_at before update on public.loans
  for each row execute function public.set_updated_at();

create index if not exists loans_user_created_idx on public.loans(user_id, created_at desc);
create index if not exists loans_user_status_idx on public.loans(user_id, is_settled, direction);
