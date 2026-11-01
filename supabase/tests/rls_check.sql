do $$
declare
  v_table_name text;
  relation_oid regclass;
  rls_enabled boolean;
  has_owner_policy boolean;
  has_required_columns boolean;
begin
  foreach v_table_name in array array[
    'profiles', 'user_preferences', 'tasks', 'projects', 'project_milestones',
    'goals', 'goal_milestones', 'habits', 'habit_completions', 'journal_entries',
    'mood_entries', 'skills', 'job_applications', 'time_entries', 'fitness_profiles',
    'weight_entries', 'exercises', 'workout_routines', 'workout_routine_exercises',
    'workout_sessions', 'workout_session_exercises', 'nutrition_entries', 'water_entries',
    'financial_accounts', 'transaction_categories', 'transactions', 'budgets',
    'savings_goals', 'savings_contributions', 'loans', 'recurring_transactions', 'calendar_events',
    'notifications', 'notification_preferences', 'telegram_connections',
    'telegram_delivery_log', 'reminder_deliveries'
  ] loop
    relation_oid := to_regclass(format('public.%I', v_table_name));
    if relation_oid is null then
      raise exception 'Missing required LifeOS table public.%', v_table_name;
    end if;

    select relrowsecurity into rls_enabled from pg_class where oid = relation_oid;
    if not rls_enabled then
      raise exception 'RLS is not enabled on public.%', v_table_name;
    end if;

    select exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = v_table_name
        and cmd = 'ALL'
        and roles @> array['authenticated']::name[]
        and qual like '%auth.uid()%user_id%'
        and with_check like '%auth.uid()%user_id%'
    ) into has_owner_policy;
    if not has_owner_policy then
      raise exception 'Missing authenticated owner policy on public.%', v_table_name;
    end if;

    select count(*) = 4 into has_required_columns
    from information_schema.columns
    where table_schema = 'public'
      and information_schema.columns.table_name = v_table_name
      and column_name in ('id', 'user_id', 'created_at', 'updated_at');
    if not has_required_columns then
      raise exception 'Missing standard ownership/audit columns on public.%', v_table_name;
    end if;
  end loop;

  if not exists (select 1 from storage.buckets where id = 'lifeos-private' and public = false) then
    raise exception 'The LifeOS avatar bucket must exist and remain private.';
  end if;
end;
$$;
