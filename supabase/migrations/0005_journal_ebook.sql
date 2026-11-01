alter table public.user_preferences
  add column if not exists journal_book_settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(journal_book_settings) = 'object');
