import { LocalNotifications } from "@capacitor/local-notifications";

type Row = { id: string; [key: string]: unknown };
type Reminder = { key: string; title: string; body: string; at: Date };

const scheduledIdsKey = (userId: string) => `lifeos-device-notification-ids:${userId}`;
const dayMs = 24 * 60 * 60 * 1000;

function atLocalTime(date: string, time = "09:00") {
  const [hours, minutes] = time.split(":").map(Number);
  const result = new Date(`${date}T00:00:00`);
  result.setHours(hours || 0, minutes || 0, 0, 0);
  return result;
}

function addRecurringInterval(date: Date, recurrence: string) {
  const next = new Date(date);
  if (recurrence === "daily") next.setDate(next.getDate() + 1);
  else if (recurrence === "weekly") next.setDate(next.getDate() + 7);
  else if (recurrence === "monthly") {
    const day = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  }
  return next;
}

function notificationId(key: string) {
  let hash = 2166136261;
  for (const character of key) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) % 2_000_000_000 + 1;
}

function remindersFromRows(
  tasks: Row[],
  events: Row[],
  recurringTransactions: Row[],
  habits: Row[],
  notifications: Row[],
) {
  const reminders: Reminder[] = [];
  const now = new Date();
  const add = (key: string, title: unknown, body: string, at: Date) => {
    if (Number.isFinite(at.getTime()) && at.getTime() > Date.now() && at.getTime() < Date.now() + 90 * dayMs) {
      reminders.push({ key, title: String(title || "LifeOS reminder"), body, at });
    }
  };

  for (const task of tasks) {
    if (!task.due_date || task.status === "done" || task.status === "cancelled") continue;
    const due = String(task.due_date);
    const recurrence = String(task.recurrence ?? "none");
    const stopDate = new Date(Date.now() + 90 * dayMs);
    let occurrence = due.includes("T") ? new Date(due) : atLocalTime(due);
    if (occurrence < now) {
      if (recurrence === "daily") occurrence.setDate(occurrence.getDate() + Math.ceil((now.getTime() - occurrence.getTime()) / dayMs));
      else if (recurrence === "weekly") occurrence.setDate(occurrence.getDate() + 7 * Math.ceil((now.getTime() - occurrence.getTime()) / (7 * dayMs)));
      else if (recurrence === "monthly") {
        const day = occurrence.getDate();
        const months = (now.getFullYear() - occurrence.getFullYear()) * 12 + now.getMonth() - occurrence.getMonth();
        occurrence.setDate(1);
        occurrence.setMonth(occurrence.getMonth() + months);
        occurrence.setDate(Math.min(day, new Date(occurrence.getFullYear(), occurrence.getMonth() + 1, 0).getDate()));
        if (occurrence < now) occurrence = addRecurringInterval(occurrence, recurrence);
      }
    }
    while (Number.isFinite(occurrence.getTime()) && occurrence <= stopDate) {
      add(`task:${task.id}:${occurrence.toISOString()}`, task.title, "This task is due.", occurrence);
      if (recurrence === "none") break;
      const next = addRecurringInterval(occurrence, recurrence);
      if (next.getTime() <= occurrence.getTime()) break;
      occurrence = next;
    }
  }

  for (const event of events) {
    if (!event.starts_at) continue;
    const start = new Date(String(event.starts_at));
    const recurrence = String(event.recurrence ?? "none");
    const stopDate = new Date(Date.now() + 90 * dayMs);
    let occurrence = new Date(start);
    if (occurrence < now && recurrence !== "none") {
      if (recurrence === "daily") occurrence.setDate(occurrence.getDate() + Math.ceil((now.getTime() - occurrence.getTime()) / dayMs));
      else if (recurrence === "weekly") occurrence.setDate(occurrence.getDate() + 7 * Math.ceil((now.getTime() - occurrence.getTime()) / (7 * dayMs)));
      else if (recurrence === "monthly") {
        const months = (now.getFullYear() - occurrence.getFullYear()) * 12 + now.getMonth() - occurrence.getMonth();
        occurrence.setMonth(occurrence.getMonth() + months);
        if (occurrence < now) occurrence.setMonth(occurrence.getMonth() + 1);
      } else if (recurrence === "yearly") {
        occurrence.setFullYear(occurrence.getFullYear() + now.getFullYear() - occurrence.getFullYear());
        if (occurrence < now) occurrence.setFullYear(occurrence.getFullYear() + 1);
      }
    }
    while (Number.isFinite(occurrence.getTime()) && occurrence <= stopDate) {
      const reminder = new Date(occurrence);
      reminder.setMinutes(reminder.getMinutes() - Number(event.reminder_minutes ?? 0));
      add(`event:${event.id}:${occurrence.toISOString()}`, event.title, "Your calendar event is coming up.", reminder);
      if (recurrence === "none") break;
      if (recurrence === "daily") occurrence.setDate(occurrence.getDate() + 1);
      else if (recurrence === "weekly") occurrence.setDate(occurrence.getDate() + 7);
      else if (recurrence === "monthly") occurrence.setMonth(occurrence.getMonth() + 1);
      else if (recurrence === "yearly") occurrence.setFullYear(occurrence.getFullYear() + 1);
      else break;
    }
  }

  for (const transaction of recurringTransactions) {
    if (transaction.is_active === false || !transaction.next_due) continue;
    let due = atLocalTime(String(transaction.next_due));
    const frequency = String(transaction.frequency ?? "monthly");
    const stop = new Date(Date.now() + 90 * dayMs);
    while (due < stop) {
      add(`bill:${transaction.id}:${due.toISOString()}`, transaction.title, "A recurring payment is due.", due);
      if (frequency === "weekly") due = new Date(due.getTime() + 7 * dayMs);
      else if (frequency === "yearly") due.setFullYear(due.getFullYear() + 1);
      else due.setMonth(due.getMonth() + 1);
    }
  }

  for (const habit of habits) {
    if (habit.is_active === false || typeof habit.reminder_time !== "string") continue;
    const time = String(habit.reminder_time).slice(0, 5);
    const frequency = String(habit.frequency ?? "daily");
    const stopDate = new Date(Date.now() + 90 * dayMs);
    const firstDate = new Date(now);
    firstDate.setSeconds(0, 0);
    firstDate.setHours(Number(time.slice(0, 2)), Number(time.slice(3, 5)), 0, 0);
    if (firstDate <= now) {
      if (frequency === "weekly") firstDate.setDate(firstDate.getDate() + 7);
      else if (frequency === "monthly") {
        const next = addRecurringInterval(firstDate, frequency);
        firstDate.setTime(next.getTime());
      } else firstDate.setDate(firstDate.getDate() + 1);
    }
    let occurrence = firstDate;
    const reminderLimit = frequency === "monthly" ? stopDate : frequency === "weekly" ? new Date(Date.now() + 7 * dayMs) : new Date(Date.now() + 7 * dayMs);
    while (occurrence <= reminderLimit) {
      add(`habit:${habit.id}:${occurrence.toISOString()}`, habit.name, "Time for your habit reminder.", occurrence);
      if (frequency === "weekly" || frequency === "monthly") occurrence = addRecurringInterval(occurrence, frequency);
      else occurrence.setDate(occurrence.getDate() + 1);
    }
  }

  for (const notification of notifications) {
    if (!notification.scheduled_for || notification.read_at) continue;
    add(`notification:${notification.id}`, notification.title, String(notification.body ?? ""), new Date(String(notification.scheduled_for)));
  }

  return reminders
    .sort((left, right) => left.at.getTime() - right.at.getTime())
    .slice(0, 60);
}

export async function requestDeviceNotificationPermission() {
  const current = await LocalNotifications.checkPermissions();
  if (current.display === "granted") return true;
  const requested = await LocalNotifications.requestPermissions();
  return requested.display === "granted";
}

export async function scheduleDeviceReminders(
  userId: string,
  data: { tasks: Row[]; events: Row[]; recurringTransactions: Row[]; habits: Row[]; notifications: Row[] },
) {
  const oldIds = JSON.parse(localStorage.getItem(scheduledIdsKey(userId)) ?? "[]") as number[];
  if (oldIds.length) await LocalNotifications.cancel({ notifications: oldIds.map((id) => ({ id })) });
  const reminders = remindersFromRows(data.tasks, data.events, data.recurringTransactions, data.habits, data.notifications);
  if (!reminders.length) {
    localStorage.removeItem(scheduledIdsKey(userId));
    return 0;
  }
  const notifications = reminders.map((reminder) => ({
    id: notificationId(reminder.key),
    title: reminder.title,
    body: reminder.body,
    schedule: { at: reminder.at },
  }));
  await LocalNotifications.schedule({ notifications });
  localStorage.setItem(scheduledIdsKey(userId), JSON.stringify(notifications.map(({ id }) => id)));
  return notifications.length;
}

export async function cancelDeviceReminders(userId: string) {
  const ids = JSON.parse(localStorage.getItem(scheduledIdsKey(userId)) ?? "[]") as number[];
  if (ids.length) await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
  localStorage.removeItem(scheduledIdsKey(userId));
}
