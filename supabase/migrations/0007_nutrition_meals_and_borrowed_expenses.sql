alter table public.nutrition_entries
  add column if not exists meal_type text;

update public.nutrition_entries
set meal_type = case
  when extract(hour from consumed_at) between 5 and 10 then 'breakfast'
  when extract(hour from consumed_at) between 11 and 14 then 'lunch'
  when extract(hour from consumed_at) between 15 and 17 then 'evening'
  else 'dinner'
end
where meal_type is null;

alter table public.nutrition_entries
  alter column meal_type set default 'breakfast',
  alter column meal_type set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'nutrition_entries_meal_type_check'
      and conrelid = 'public.nutrition_entries'::regclass
  ) then
    alter table public.nutrition_entries
      add constraint nutrition_entries_meal_type_check
      check (meal_type in ('breakfast', 'lunch', 'evening', 'dinner'));
  end if;
end;
$$;

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

  insert into public.loans (user_id, person_name, direction, amount, loan_date, notes)
  values (
    p_user_id,
    trim(p_borrowed_from),
    'borrowed',
    p_borrowed_amount,
    p_transaction_date,
    concat_ws(E'\n', nullif(trim(p_notes), ''), 'Borrowed for: ' || trim(p_title))
  );

  return new_transaction_id;
end;
$$;

revoke all on function public.create_expense_with_borrowing(uuid, text, numeric, date, uuid, uuid, text, text, numeric) from public;
grant execute on function public.create_expense_with_borrowing(uuid, text, numeric, date, uuid, uuid, text, text, numeric) to authenticated;
