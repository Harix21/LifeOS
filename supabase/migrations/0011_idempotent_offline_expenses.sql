drop function if exists public.create_expense_with_funding_split(
  uuid, text, numeric, date, uuid, numeric, uuid, text, text, numeric
);
drop function if exists public.create_expense_with_funding_split(
  uuid, text, numeric, date, uuid, numeric, uuid, text, text, numeric, text
);
drop function if exists public.create_expense_with_funding_split(
  uuid, text, numeric, date, uuid, numeric, uuid, text, text, numeric, text, uuid
);

with duplicate_links as (
  select id, row_number() over (partition by transaction_id order by created_at, id) as position
  from public.loans
  where transaction_id is not null
)
update public.loans loan
set transaction_id = null
from duplicate_links
where duplicate_links.id = loan.id
  and duplicate_links.position > 1;

create unique index if not exists loans_transaction_id_unique_idx
  on public.loans(transaction_id)
  where transaction_id is not null;

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
  p_loan_direction text default 'borrowed',
  p_transaction_id uuid default null,
  p_loan_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_transaction_id uuid;
  new_loan_id uuid;
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

  new_transaction_id := coalesce(p_transaction_id, gen_random_uuid());

  insert into public.transactions (
    id, user_id, title, amount, type, transaction_date, account_id, account_paid_amount, category_id, notes
  )
  values (
    new_transaction_id, p_user_id, p_title, p_amount, 'expense', p_transaction_date, p_account_id,
    p_account_amount, p_category_id, p_notes
  )
  on conflict (id) do nothing;

  if not exists (
    select 1 from public.transactions
    where id = new_transaction_id
      and user_id = p_user_id
      and title = p_title
      and amount = p_amount
      and type = 'expense'
      and transaction_date = p_transaction_date
      and account_id is not distinct from p_account_id
      and account_paid_amount = p_account_amount
      and category_id is not distinct from p_category_id
      and notes is not distinct from p_notes
  ) then
    raise exception 'The offline transaction ID already belongs to a different record';
  end if;

  if p_borrowed_amount > 0 then
    new_loan_id := coalesce(p_loan_id, gen_random_uuid());
    insert into public.loans (id, user_id, person_name, direction, amount, loan_date, notes, transaction_id)
    values (
      new_loan_id,
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
    )
    on conflict (transaction_id) where transaction_id is not null do nothing;

    if not exists (
      select 1 from public.loans
      where id = new_loan_id
        and user_id = p_user_id
        and person_name = trim(p_borrowed_from)
        and direction = p_loan_direction
        and amount = p_borrowed_amount
        and loan_date = p_transaction_date
        and transaction_id = new_transaction_id
    ) then
      raise exception 'The offline loan ID already belongs to a different record';
    end if;
  end if;

  return new_transaction_id;
end;
$$;

revoke all on function public.create_expense_with_funding_split(
  uuid, text, numeric, date, uuid, numeric, uuid, text, text, numeric, text, uuid, uuid
) from public;
grant execute on function public.create_expense_with_funding_split(
  uuid, text, numeric, date, uuid, numeric, uuid, text, text, numeric, text, uuid, uuid
) to authenticated;
