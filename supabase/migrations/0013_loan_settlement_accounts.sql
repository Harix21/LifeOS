alter table public.loans
  add column if not exists settlement_account_id uuid references public.financial_accounts(id) on delete set null,
  add column if not exists settled_at date;

create index if not exists loans_settlement_account_idx
  on public.loans(user_id, settlement_account_id)
  where settlement_account_id is not null;
