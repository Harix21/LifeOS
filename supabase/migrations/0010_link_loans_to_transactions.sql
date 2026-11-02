alter table public.loans
  add column if not exists transaction_id uuid references public.transactions(id) on delete set null;

create index if not exists loans_user_transaction_idx
  on public.loans(user_id, transaction_id)
  where transaction_id is not null;

with matches as (
  select
    loan.id as loan_id,
    tx.id as transaction_id,
    count(*) over (partition by loan.id) as match_count
  from public.loans loan
  join public.transactions tx
    on tx.user_id = loan.user_id
    and tx.type = 'expense'
    and tx.transaction_date = loan.loan_date
    and tx.amount >= loan.amount
    and tx.title = (regexp_match(loan.notes, 'Borrowed for: ([^\r\n]*)'))[1]
  where loan.transaction_id is null
    and loan.notes like '%Borrowed for: %'
)
update public.loans loan
set transaction_id = matches.transaction_id
from matches
where matches.loan_id = loan.id
  and matches.match_count = 1;

drop function if exists public.create_expense_with_funding_split(
  uuid, text, numeric, date, uuid, numeric, uuid, text, text, numeric
);

create function public.create_expense_with_funding_split(
  p_user_id uuid,
  p_title text,
  p_amount numeric,
  p_transaction_date date,
  p_account_id uuid,
  p_account_amount numeric,
  p_category_id uuid default null,
  p_notes text default null,
  p_borrowed_from text default null,
  p_borrowed_amount numeric default 0,
  p_loan_direction text default 'borrowed'
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
    or p_loan_direction is null
    or p_loan_direction not in ('borrowed', 'lent') then
    raise exception 'Enter valid transaction and loan details';
  end if;

  if (p_loan_direction = 'borrowed' and round(p_account_amount + p_borrowed_amount, 2) <> round(p_amount, 2))
    or (p_loan_direction = 'lent' and (round(p_account_amount, 2) <> round(p_amount, 2)
      or round(p_borrowed_amount, 2) <> round(p_amount, 2))) then
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
    raise exception 'Enter the person associated with this loan';
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
    insert into public.loans (user_id, person_name, direction, amount, loan_date, notes, transaction_id)
    values (
      p_user_id,
      trim(p_borrowed_from),
      p_loan_direction,
      p_borrowed_amount,
      p_transaction_date,
      concat_ws(E'\n', nullif(trim(p_notes), ''), case
        when p_loan_direction = 'lent' then 'Lent for: ' || trim(p_title)
        else 'Borrowed for: ' || trim(p_title)
      end),
      new_transaction_id
    );
  end if;

  return new_transaction_id;
end;
$$;

revoke all on function public.create_expense_with_funding_split(
  uuid, text, numeric, date, uuid, numeric, uuid, text, text, numeric, text
) from public;
grant execute on function public.create_expense_with_funding_split(
  uuid, text, numeric, date, uuid, numeric, uuid, text, text, numeric, text
) to authenticated;

create or replace function public.create_expense_with_borrowing(
  p_user_id uuid,
  p_title text,
  p_amount numeric,
  p_transaction_date date,
  p_account_id uuid default null,
  p_category_id uuid default null,
  p_notes text default null,
  p_borrowed_from text default null,
  p_borrowed_amount numeric default null
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

  if coalesce(trim(p_borrowed_from), '') = ''
    or p_borrowed_amount is null
    or p_borrowed_amount <= 0
    or p_borrowed_amount > p_amount then
    raise exception 'A valid lender and borrowed amount are required';
  end if;

  insert into public.transactions (user_id, title, amount, type, transaction_date, account_id, category_id, notes)
  values (p_user_id, p_title, p_amount, 'expense', p_transaction_date, p_account_id, p_category_id, p_notes)
  returning id into new_transaction_id;

  insert into public.loans (user_id, person_name, direction, amount, loan_date, notes, transaction_id)
  values (
    p_user_id,
    trim(p_borrowed_from),
    'borrowed',
    p_borrowed_amount,
    p_transaction_date,
    concat_ws(E'\n', nullif(trim(p_notes), ''), 'Borrowed for: ' || trim(p_title)),
    new_transaction_id
  );

  return new_transaction_id;
end;
$$;

revoke all on function public.create_expense_with_borrowing(uuid, text, numeric, date, uuid, uuid, text, text, numeric) from public;
grant execute on function public.create_expense_with_borrowing(uuid, text, numeric, date, uuid, uuid, text, text, numeric) to authenticated;
