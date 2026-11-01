import { createClient } from "npm:@supabase/supabase-js@2";

type Reminder = {
  user_id: string;
  source_type: string;
  source_id: string;
  scheduled_for: string;
  title: string;
  body: string;
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function addCalendarOccurrence(date: Date, recurrence: string) {
  const next = new Date(date);
  if (recurrence === "daily") next.setDate(next.getDate() + 1);
  else if (recurrence === "weekly") next.setDate(next.getDate() + 7);
  else if (recurrence === "monthly") {
    const day = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  } else if (recurrence === "yearly") {
    const month = next.getMonth();
    const day = next.getDate();
    next.setDate(1);
    next.setFullYear(next.getFullYear() + 1);
    next.setMonth(month);
    next.setDate(Math.min(day, new Date(next.getFullYear(), month + 1, 0).getDate()));
  }
  return next;
}

function nextEventReminder(event: { starts_at: string; reminder_minutes: number; recurrence: string }, now: Date, horizon: Date) {
  let occurrence = new Date(event.starts_at);
  const recurrence = String(event.recurrence ?? "none");
  let reminderAt = new Date(occurrence.getTime() - Number(event.reminder_minutes) * 60_000);
  if (recurrence === "daily" && reminderAt < now) {
    occurrence.setDate(occurrence.getDate() + Math.ceil((now.getTime() - reminderAt.getTime()) / 86_400_000));
  } else if (recurrence === "weekly" && reminderAt < now) {
    occurrence.setDate(occurrence.getDate() + Math.ceil((now.getTime() - reminderAt.getTime()) / (7 * 86_400_000)) * 7);
  } else if (recurrence === "monthly" || recurrence === "yearly") {
    for (let count = 0; count < 10_000 && reminderAt < now; count += 1) {
      occurrence = addCalendarOccurrence(occurrence, recurrence);
      reminderAt = new Date(occurrence.getTime() - Number(event.reminder_minutes) * 60_000);
    }
  }
  reminderAt = new Date(occurrence.getTime() - Number(event.reminder_minutes) * 60_000);
  return recurrence !== "none" && reminderAt >= now && reminderAt <= horizon ? { occurrence, reminderAt } : recurrence === "none" && reminderAt >= now && reminderAt <= horizon ? { occurrence, reminderAt } : null;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json(405, { error: "Method not allowed." });
  const schedulerSecret = Deno.env.get("SCHEDULER_SECRET");
  if (!schedulerSecret || request.headers.get("Authorization") !== `Bearer ${schedulerSecret}`) {
    return json(401, { error: "Invalid scheduler credentials." });
  }
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return json(503, { error: "Supabase service configuration is incomplete." });

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date();
  const horizon = new Date(now.getTime() + 60_000);
  const taskLookback = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
  const [tasksResult, eventsResult, billsResult, budgetsResult, transactionsResult] = await Promise.all([
    admin.from("tasks").select("id,user_id,title,due_date").neq("status", "done").not("due_date", "is", null)
      .gte("due_date", taskLookback.toISOString()).lte("due_date", horizon.toISOString()),
    admin.from("calendar_events").select("id,user_id,title,starts_at,reminder_minutes,recurrence")
      .not("reminder_minutes", "is", null).or(`starts_at.gte.${now.toISOString()},recurrence.neq.none`)
      .lte("starts_at", new Date(now.getTime() + 365 * 24 * 60 * 60_000).toISOString()),
    admin.from("recurring_transactions").select("id,user_id,title,type,next_due").eq("is_active", true).lte("next_due", now.toISOString().slice(0, 10)),
    admin.from("budgets").select("id,user_id,name,amount,period,starts_on,category_id"),
    admin.from("transactions").select("user_id,amount,category_id,type,transaction_date").eq("type", "expense")
      .gte("transaction_date", `${now.getUTCFullYear()}-01-01`).lte("transaction_date", now.toISOString().slice(0, 10)),
  ]);
  const fetchError = tasksResult.error ?? eventsResult.error ?? billsResult.error ?? budgetsResult.error ?? transactionsResult.error;
  if (fetchError) return json(500, { error: "Could not load scheduled reminders." });

  const reminders: Reminder[] = [];
  for (const task of tasksResult.data ?? []) {
    reminders.push({
      user_id: task.user_id, source_type: "task", source_id: task.id, scheduled_for: task.due_date,
      title: `Task due: ${task.title}`, body: "A LifeOS task is due.",
    });
  }
  for (const event of eventsResult.data ?? []) {
    const next = nextEventReminder(event, now, horizon);
    if (next) {
      reminders.push({
        user_id: event.user_id, source_type: "calendar_event", source_id: event.id, scheduled_for: next.reminderAt.toISOString(),
        title: `Upcoming event: ${event.title}`, body: `Your event starts at ${next.occurrence.toLocaleString()}.`,
      });
    }
  }
  for (const bill of billsResult.data ?? []) {
    const scheduledFor = new Date(`${bill.next_due}T09:00:00.000Z`);
    reminders.push({
      user_id: bill.user_id, source_type: "recurring_transaction", source_id: bill.id, scheduled_for: scheduledFor.toISOString(),
      title: `${bill.type === "income" ? "Income" : "Bill"} due: ${bill.title}`, body: `Scheduled for ${bill.next_due}.`,
    });
  }
  for (const budget of budgetsResult.data ?? []) {
    const periodStart = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
    if (budget.period === "weekly") periodStart.setUTCDate(periodStart.getUTCDate() - 6);
    if (budget.period === "monthly") periodStart.setUTCDate(1);
    if (budget.period === "yearly") periodStart.setUTCMonth(0, 1);
    const startDate = [String(budget.starts_on), periodStart.toISOString().slice(0, 10)].sort().at(-1)!;
    const spent = (transactionsResult.data ?? []).filter((transaction) =>
      transaction.user_id === budget.user_id
      && String(transaction.transaction_date) >= startDate
      && (!budget.category_id || transaction.category_id === budget.category_id),
    ).reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0);
    const limit = Number(budget.amount);
    const percentage = limit > 0 ? Math.floor(spent / limit * 100) : 0;
    for (const threshold of [80, 100]) {
      if (percentage >= threshold) {
        reminders.push({
          user_id: budget.user_id,
          source_type: `budget_warning_${threshold}`,
          source_id: budget.id,
          scheduled_for: `${startDate}T00:00:00.000Z`,
          title: `Budget warning: ${budget.name}`,
          body: `Recorded spending has reached ${percentage}% of this ${budget.period} budget (${spent} of ${limit}).`,
        });
      }
    }
  }

  let created = 0;
  let telegramSent = 0;
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  for (const reminder of reminders) {
    const { error: claimError } = await admin.from("reminder_deliveries").insert({
      user_id: reminder.user_id,
      source_type: reminder.source_type,
      source_id: reminder.source_id,
      scheduled_for: reminder.scheduled_for,
    });
    if (claimError?.code === "23505") continue;
    if (claimError) return json(500, { error: "Could not claim a reminder delivery." });

    const { data: notification, error: notificationError } = await admin.from("notifications").insert({
      user_id: reminder.user_id,
      title: reminder.title,
      body: reminder.body,
      type: `${reminder.source_type}_reminder`,
      scheduled_for: reminder.scheduled_for,
    }).select("id").single();
    if (notificationError) {
      await admin.from("reminder_deliveries").delete().eq("user_id", reminder.user_id)
        .eq("source_type", reminder.source_type).eq("source_id", reminder.source_id).eq("scheduled_for", reminder.scheduled_for);
      return json(500, { error: "Could not save an in-app reminder." });
    }
    const { error: linkError } = await admin.from("reminder_deliveries").update({ notification_id: notification.id })
      .eq("user_id", reminder.user_id).eq("source_type", reminder.source_type)
      .eq("source_id", reminder.source_id).eq("scheduled_for", reminder.scheduled_for);
    if (linkError) return json(500, { error: "Reminder was created but its delivery record could not be updated." });
    created += 1;

    if (token) {
      const { data: connection } = await admin.from("telegram_connections").select("chat_id,is_enabled").eq("user_id", reminder.user_id).maybeSingle();
      if (!connection?.is_enabled || !connection.chat_id) continue;
      const { data: allowed, error: rateError } = await admin.rpc("claim_telegram_rate_limit", { p_user_id: reminder.user_id });
      if (rateError || !allowed) continue;
      let deliveryStatus: "sent" | "failed" = "failed";
      let deliveryError: string | null = null;
      try {
        const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: connection.chat_id, text: `${reminder.title}\n${reminder.body}` }),
        });
        const result = await telegramResponse.json();
        if (telegramResponse.ok && result.ok === true) { deliveryStatus = "sent"; telegramSent += 1; }
        else deliveryError = typeof result.description === "string" ? result.description.slice(0, 500) : `Telegram returned HTTP ${telegramResponse.status}.`;
      } catch (error) {
        deliveryError = error instanceof Error ? error.message.slice(0, 500) : "Telegram request failed.";
      }
      const { error: logError } = await admin.from("telegram_delivery_log").insert({
        user_id: reminder.user_id, notification_id: notification.id, status: deliveryStatus, error_message: deliveryError,
      });
      if (logError) return json(500, { error: "Reminder was created but Telegram delivery could not be logged." });
    }
  }

  return json(200, { created, telegram_sent: telegramSent });
});
