create table if not exists public.personal_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_name text not null,
  document_type text not null check (document_type in ('aadhaar', 'pan', 'passport', 'driving_license', 'voter_id', 'other')),
  holder_name text,
  document_number text,
  issuing_authority text,
  issue_date date,
  expiry_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid,
  card_name text not null,
  card_type text not null check (card_type in ('debit', 'credit', 'prepaid', 'forex', 'other')),
  issuer text,
  network text,
  last_four text check (last_four is null or last_four ~ '^[0-9]{4}$'),
  expiry_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, account_id) references public.financial_accounts(user_id, id) on delete set null (account_id)
);

alter table public.personal_documents enable row level security;
drop policy if exists personal_documents_owner_access on public.personal_documents;
create policy personal_documents_owner_access on public.personal_documents for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
grant select, insert, update, delete on public.personal_documents to authenticated;

alter table public.payment_cards enable row level security;
drop policy if exists payment_cards_owner_access on public.payment_cards;
create policy payment_cards_owner_access on public.payment_cards for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
grant select, insert, update, delete on public.payment_cards to authenticated;

drop trigger if exists personal_documents_set_updated_at on public.personal_documents;
create trigger personal_documents_set_updated_at before update on public.personal_documents
for each row execute function public.set_updated_at();

drop trigger if exists payment_cards_set_updated_at on public.payment_cards;
create trigger payment_cards_set_updated_at before update on public.payment_cards
for each row execute function public.set_updated_at();

create index if not exists personal_documents_user_created_idx on public.personal_documents(user_id, created_at desc);
create index if not exists payment_cards_user_created_idx on public.payment_cards(user_id, created_at desc);
