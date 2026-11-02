alter table public.tasks
  add column recurrence text not null default 'none'
  check (recurrence in ('none', 'daily', 'weekly', 'monthly'));

alter table public.habits
  drop constraint if exists habits_frequency_check;

alter table public.habits
  add constraint habits_frequency_check
  check (frequency in ('daily', 'weekly', 'monthly'));
