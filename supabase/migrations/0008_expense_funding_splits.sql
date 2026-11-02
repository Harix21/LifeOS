alter table public.transactions
  add column if not exists account_paid_amount numeric(14,2);

update public.transactions
set account_paid_amount = case when account_id is null then 0 else amount end
where account_paid_amount is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_account_paid_amount_check'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_account_paid_amount_check
      check (account_paid_amount is null or (account_paid_amount >= 0 and account_paid_amount <= amount));
  end if;
end;
$$;

create or replace function public.create_expense_with_funding_split(
  p_user_id uuid,
  p_title text,
  p_amount numeric,
  p_transaction_date date,
  p_account_id uuid,
  p_account_amount numeric,
  p_category_id uuid default null,
  p_notes text default null,
  p_borrowed_from text default null,
  p_borrowed_amount numeric default 0
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_transaction_id uuid;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'Not authorized to create this expense';
  end if;

  if nullif(trim(p_title), '') is null
    or p_amount is null
    or p_transaction_date is null
    or p_account_amount is null
    or p_borrowed_amount is null
    or p_amount <= 0
    or p_account_amount < 0
    or p_borrowed_amount < 0
    or round(p_account_amount + p_borrowed_amount, 2) <> round(p_amount, 2) then
    raise exception 'Account and borrowed amounts must add up to the expense total';
  end if;

  if p_category_id is not null and not exists (
    select 1 from public.transaction_categories
    where id = p_category_id and user_id = p_user_id and type = 'expense'
  ) then
    raise exception 'Choose a valid expense category';
  end if;

  if p_account_amount > 0 and (
    p_account_id is null
    or not exists (
      select 1 from public.financial_accounts
      where id = p_account_id and user_id = p_user_id
    )
  ) then
    raise exception 'Choose a valid account for the account-funded amount';
  end if;

  if p_account_amount = 0 and p_account_id is not null then
    raise exception 'An account cannot be selected when no amount is paid from it';
  end if;

  if p_borrowed_amount > 0 and coalesce(trim(p_borrowed_from), '') = '' then
    raise exception 'Enter the person you borrowed from';
  end if;

  insert into public.transactions (
    user_id, title, amount, type, transaction_date, account_id, account_paid_amount, category_id, notes
  )
  values (
    p_user_id, p_title, p_amount, 'expense', p_transaction_date, p_account_id,
    p_account_amount, p_category_id, p_notes
  )
  returning id into new_transaction_id;

  if p_borrowed_amount > 0 then
    insert into public.loans (user_id, person_name, direction, amount, loan_date, notes)
    values (
      p_user_id,
      trim(p_borrowed_from),
      'borrowed',
      p_borrowed_amount,
      p_transaction_date,
      concat_ws(E'\n', nullif(trim(p_notes), ''), 'Borrowed for: ' || trim(p_title))
    );
  end if;

  return new_transaction_id;
end;
$$;

revoke all on function public.create_expense_with_funding_split(uuid, text, numeric, date, uuid, numeric, uuid, text, text, numeric) from public;
grant execute on function public.create_expense_with_funding_split(uuid, text, numeric, date, uuid, numeric, uuid, text, text, numeric) to authenticated;
