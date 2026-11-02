export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";

type DemoRow = { id: string; user_id: string; created_at: string; updated_at: string; [key: string]: unknown };

function dateOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function atTime(date: string, hour: number, minute = 0) {
  const value = new Date(`${date}T00:00:00`);
  value.setHours(hour, minute, 0, 0);
  return value.toISOString();
}

function row(id: number, fields: Record<string, unknown>, userId: string): DemoRow {
  const timestamp = atTime(dateOffset(-Math.max(0, id % 7)), 9);
  return {
    id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
    user_id: userId,
    created_at: timestamp,
    updated_at: timestamp,
    ...fields,
  };
}

export function getDemoProfile(userId: string) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    user_id: userId,
    display_name: "Alex Morgan",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    onboarding_complete: true,
    personal_goals: "Make time for reading and meaningful downtime.",
    fitness_goals: "Build a steady strength and mobility routine.",
    financial_goals: "Save consistently and stay within monthly budgets.",
  };
}

export function getDemoPreferences(userId: string) {
  return {
    id: "00000000-0000-4000-8000-000000000002",
    user_id: userId,
    theme: "system",
    accent_color: "#5b82ed",
    currency: "INR",
    date_format: "DD/MM/YYYY",
    week_starts_on: 1,
    time_format: "24h",
    journal_theme: "sage",
    journal_data_types: ["tasks", "habits", "water", "nutrition", "transactions", "savings", "budgets", "calendar", "workouts", "mood"],
    journal_book_settings: { includeProfilePages: true },
  };
}

export function getDemoRows(table: string, userId: string): DemoRow[] {
  const today = dateOffset(0);
  const yesterday = dateOffset(-1);
  const tomorrow = dateOffset(1);
  const dayBefore = dateOffset(-2);
  const accountId = "00000000-0000-4000-8000-000000000201";
  const projectId = "00000000-0000-4000-8000-000000000301";
  const habitIds = [
    "00000000-0000-4000-8000-000000000101",
    "00000000-0000-4000-8000-000000000102",
    "00000000-0000-4000-8000-000000000103",
    "00000000-0000-4000-8000-000000000104",
  ];

  const tables: Record<string, DemoRow[]> = {
    tasks: [
      row(1, { title: "Plan the week", description: "Choose three priorities and block time for focused work.", area: "Personal", status: "done", priority: "medium", due_date: atTime(today, 8), completed_at: atTime(today, 8, 30) }, userId),
      row(2, { title: "Review project milestones", area: "Professional", status: "in_progress", priority: "high", due_date: atTime(today, 15) }, userId),
      row(3, { title: "Evening strength session", area: "Fitness", status: "todo", priority: "medium", due_date: atTime(today, 18) }, userId),
      row(4, { title: "Prepare monthly budget", area: "Finance", status: "todo", priority: "high", due_date: atTime(tomorrow, 10) }, userId),
      row(5, { title: "Read for 20 minutes", area: "Personal", status: "todo", priority: "low", due_date: atTime(tomorrow, 20) }, userId),
      row(6, { title: "Send project update", area: "Professional", status: "done", priority: "medium", due_date: atTime(yesterday, 11), completed_at: atTime(yesterday, 10, 45) }, userId),
      row(7, { title: "Book annual check-up", area: "Personal", status: "todo", priority: "low", due_date: atTime(dayBefore, 12) }, userId),
    ],
    habits: [
      row(101, { name: "Morning movement", description: "Stretch or walk before work.", icon: "Dumbbell", color: "teal", frequency: "daily", reminder_time: "07:00", is_active: true }, userId),
      row(102, { name: "Read", description: "Read a few pages every day.", icon: "BookOpen", color: "violet", frequency: "daily", reminder_time: "20:30", is_active: true }, userId),
      row(103, { name: "Drink water", icon: "Droplets", color: "blue", frequency: "daily", is_active: true }, userId),
      row(104, { name: "Reflect", description: "Write down one thing that went well.", icon: "Leaf", color: "green", frequency: "daily", reminder_time: "21:00", is_active: true }, userId),
    ],
    habit_completions: [
      ...[0, 1, 2, 3, 4, 5, 6].flatMap((offset) => [
        row(110 + offset, { habit_id: habitIds[0], completed_on: dateOffset(-offset), note: "A little movement counts." }, userId),
        row(120 + offset, { habit_id: habitIds[2], completed_on: dateOffset(-offset) }, userId),
      ]),
      row(130, { habit_id: habitIds[1], completed_on: today, note: "Finished a chapter." }, userId),
      row(131, { habit_id: habitIds[3], completed_on: yesterday }, userId),
    ],
    goals: [
      row(31, { title: "Build a reading habit", area: "Personal", description: "Read consistently throughout the week.", target_value: 20, current_value: 12, target_date: dateOffset(45), status: "active" }, userId),
      row(32, { title: "Run a comfortable 5K", area: "Fitness", target_value: 5, current_value: 3.2, target_date: dateOffset(75), status: "active" }, userId),
      row(33, { title: "Emergency fund", area: "Finance", target_value: 100000, current_value: 42500, target_date: dateOffset(180), status: "active" }, userId),
    ],
    projects: [
      row(301, { name: "Personal portfolio", description: "Refresh the portfolio and publish two case studies.", status: "active", start_date: dateOffset(-20), target_date: dateOffset(21) }, userId),
      row(302, { name: "Home refresh", description: "A small weekend-by-weekend home organization project.", status: "active", start_date: dateOffset(-10), target_date: dateOffset(40) }, userId),
    ],
    project_milestones: [
      row(311, { project_id: projectId, title: "Outline case studies", due_date: dateOffset(2), completed_at: null }, userId),
      row(312, { project_id: projectId, title: "Publish portfolio refresh", due_date: dateOffset(18), completed_at: null }, userId),
    ],
    skills: [
      row(321, { name: "Product design", category: "Professional", proficiency: 78, notes: "Growing research and prototyping skills." }, userId),
      row(322, { name: "Writing", category: "Personal", proficiency: 65, notes: "Practicing clear, concise writing." }, userId),
    ],
    job_applications: [
      row(331, { company: "Northstar Labs", role: "Product Designer", status: "interview", applied_on: dateOffset(-5), follow_up_on: tomorrow, notes: "Prepare a short portfolio walkthrough." }, userId),
    ],
    time_entries: [
      row(341, { project_id: projectId, title: "Portfolio planning", started_at: atTime(today, 9), ended_at: atTime(today, 10, 30), notes: "Outlined the next case study." }, userId),
      row(342, { project_id: projectId, title: "Case study research", started_at: atTime(yesterday, 14), ended_at: atTime(yesterday, 15, 15) }, userId),
    ],
    fitness_profiles: [
      row(401, { height_cm: 172, target_weight_kg: 68, daily_calorie_target: 2100, daily_water_target_ml: 2500 }, userId),
    ],
    weight_entries: [
      row(411, { weight_kg: 71.4, recorded_on: dateOffset(-28), note: "Monthly check-in." }, userId),
      row(412, { weight_kg: 71.1, recorded_on: dateOffset(-21) }, userId),
      row(413, { weight_kg: 70.8, recorded_on: dateOffset(-14) }, userId),
      row(414, { weight_kg: 70.6, recorded_on: dateOffset(-7) }, userId),
      row(415, { weight_kg: 70.4, recorded_on: today, note: "Morning weigh-in." }, userId),
    ],
    exercises: [
      row(421, { name: "Goblet squat", muscle_group: "Legs", equipment: "Dumbbell" }, userId),
      row(422, { name: "Dumbbell row", muscle_group: "Back", equipment: "Dumbbells" }, userId),
    ],
    workout_routines: [
      row(431, { name: "Full body A", description: "A balanced 35-minute strength session." }, userId),
    ],
    workout_sessions: [
      row(441, { routine_id: null, title: "Easy run", started_at: atTime(today, 7, 15), duration_minutes: 28, calories_burned: 230, notes: "Easy conversational pace." }, userId),
      row(442, { routine_id: null, title: "Full body strength", started_at: atTime(yesterday, 18), duration_minutes: 42, calories_burned: 310, notes: "Steady effort." }, userId),
      row(443, { routine_id: null, title: "Mobility and recovery", started_at: atTime(dayBefore, 7, 30), duration_minutes: 18, calories_burned: 65 }, userId),
    ],
    workout_session_exercises: [
      row(451, { session_id: "00000000-0000-4000-8000-000000000442", exercise_id: null, exercise_name: "Goblet squat", sets: 3, reps: 10, weight_kg: 16 }, userId),
      row(452, { session_id: "00000000-0000-4000-8000-000000000442", exercise_id: null, exercise_name: "Dumbbell row", sets: 3, reps: 12, weight_kg: 12 }, userId),
    ],
    nutrition_entries: [
      row(461, { description: "Oats, banana and yogurt", meal_type: "breakfast", calories: 420, protein_g: 21, carbohydrates_g: 62, fat_g: 10, consumed_at: atTime(today, 8) }, userId),
      row(462, { description: "Paneer and grain bowl", meal_type: "lunch", calories: 610, protein_g: 32, carbohydrates_g: 68, fat_g: 22, consumed_at: atTime(today, 13) }, userId),
      row(463, { description: "Vegetable soup", meal_type: "dinner", calories: 280, protein_g: 12, carbohydrates_g: 34, fat_g: 9, consumed_at: atTime(yesterday, 19) }, userId),
    ],
    water_entries: [
      row(471, { amount_ml: 400, consumed_at: atTime(today, 7, 30) }, userId),
      row(472, { amount_ml: 500, consumed_at: atTime(today, 10) }, userId),
      row(473, { amount_ml: 350, consumed_at: atTime(today, 13, 30) }, userId),
      row(474, { amount_ml: 1800, consumed_at: atTime(yesterday, 20) }, userId),
    ],
    financial_accounts: [
      row(201, { name: "Everyday account", type: "checking", currency: "INR", opening_balance: 52000 }, userId),
      row(202, { name: "Rainy day savings", type: "savings", currency: "INR", opening_balance: 85000 }, userId),
    ],
    transaction_categories: [
      row(211, { name: "Salary", type: "income" }, userId),
      row(212, { name: "Food & dining", type: "expense" }, userId),
      row(213, { name: "Transport", type: "expense" }, userId),
      row(214, { name: "Home", type: "expense" }, userId),
    ],
    transactions: [
      row(221, { account_id: accountId, category_id: "00000000-0000-4000-8000-000000000212", title: "Groceries", amount: 1250, type: "expense", transaction_date: today, notes: "Weekly essentials." }, userId),
      row(222, { account_id: accountId, category_id: "00000000-0000-4000-8000-000000000213", title: "Metro card", amount: 350, type: "expense", transaction_date: today }, userId),
      row(223, { account_id: accountId, category_id: "00000000-0000-4000-8000-000000000211", title: "Monthly salary", amount: 78000, type: "income", transaction_date: dateOffset(-3) }, userId),
      row(224, { account_id: accountId, category_id: "00000000-0000-4000-8000-000000000212", title: "Lunch with team", amount: 680, type: "expense", transaction_date: yesterday }, userId),
      row(225, { account_id: accountId, category_id: "00000000-0000-4000-8000-000000000214", title: "Home supplies", amount: 2150, type: "expense", transaction_date: dateOffset(-4) }, userId),
      row(226, { account_id: accountId, category_id: "00000000-0000-4000-8000-000000000212", title: "Coffee and breakfast", amount: 420, type: "expense", transaction_date: dayBefore }, userId),
      row(227, { account_id: accountId, category_id: "00000000-0000-4000-8000-000000000213", title: "Cab fare", amount: 540, type: "expense", transaction_date: dateOffset(-6) }, userId),
    ],
    budgets: [
      row(231, { category_id: "00000000-0000-4000-8000-000000000212", name: "Food & dining", amount: 18000, period: "monthly", starts_on: `${today.slice(0, 7)}-01` }, userId),
      row(232, { category_id: "00000000-0000-4000-8000-000000000213", name: "Transport", amount: 5000, period: "monthly", starts_on: `${today.slice(0, 7)}-01` }, userId),
      row(233, { category_id: null, name: "Home & essentials", amount: 12000, period: "monthly", starts_on: `${today.slice(0, 7)}-01` }, userId),
    ],
    savings_goals: [
      row(241, { name: "Emergency fund", target_amount: 150000, current_amount: 85000, target_date: dateOffset(180) }, userId),
    ],
    savings_contributions: [
      row(251, { savings_goal_id: "00000000-0000-4000-8000-000000000241", amount: 1500, contributed_on: today, note: "Automated weekly transfer." }, userId),
      row(252, { savings_goal_id: "00000000-0000-4000-8000-000000000241", amount: 1500, contributed_on: dateOffset(-7) }, userId),
      row(253, { savings_goal_id: "00000000-0000-4000-8000-000000000241", amount: 1500, contributed_on: dateOffset(-14) }, userId),
    ],
    loans: [
      row(261, { person_name: "Jamie", direction: "lent", amount: 2500, loan_date: dateOffset(-10), due_date: dateOffset(10), is_settled: false, notes: "Weekend trip booking." }, userId),
      row(262, { person_name: "Taylor", direction: "borrowed", amount: 1200, loan_date: dateOffset(-4), due_date: dateOffset(14), is_settled: false, notes: "Shared dinner." }, userId),
    ],
    calendar_events: [
      row(271, { title: "Weekly planning", description: "Review priorities and plan the week.", starts_at: atTime(today, 9, 30), ends_at: atTime(today, 10), area: "Personal", reminder_minutes: 15, recurrence: "weekly" }, userId),
      row(272, { title: "Portfolio review", description: "Walk through the latest case study.", starts_at: atTime(today, 15, 30), ends_at: atTime(today, 16, 15), area: "Professional", reminder_minutes: 10, recurrence: "none" }, userId),
      row(273, { title: "Strength training", starts_at: atTime(today, 18), ends_at: atTime(today, 19), area: "Fitness", recurrence: "none" }, userId),
      row(274, { title: "Project check-in", starts_at: atTime(tomorrow, 11), ends_at: atTime(tomorrow, 11, 30), area: "Professional", reminder_minutes: 10, recurrence: "none" }, userId),
    ],
    journal_entries: [
      row(281, { title: "A steady start", body: "I made room for a calm morning and got the most important thing done first. Keep the evening simple and get a little movement in.", entry_date: today, mood: "Focused" }, userId),
      row(282, { title: "A good reset", body: "A short walk helped clear my head. I want to carry that feeling into tomorrow.", entry_date: yesterday, mood: "Calm" }, userId),
      row(283, { title: "Small wins", body: "Finished the project outline and kept up with water breaks.", entry_date: dayBefore, mood: "Encouraged" }, userId),
    ],
    mood_entries: [
      row(291, { mood: "Focused", intensity: 7, note: "A good balance of focused work and breaks.", recorded_at: atTime(today, 9) }, userId),
      row(292, { mood: "Calm", intensity: 8, note: "Enjoyed a quiet evening.", recorded_at: atTime(yesterday, 20) }, userId),
    ],
    notifications: [
      row(501, { title: "Portfolio review today", body: "Your project check-in is coming up this afternoon.", type: "reminder", scheduled_for: atTime(today, 15), read_at: null }, userId),
      row(502, { title: "Habit streak: 7 days", body: "You checked in for morning movement all week.", type: "habit", scheduled_for: atTime(today, 8), read_at: atTime(today, 8, 15) }, userId),
    ],
    notification_preferences: [row(511, { browser_enabled: false }, userId)],
    telegram_connections: [],
    workout_routine_exercises: [],
    recurring_transactions: [],
    goal_milestones: [],
    reminder_deliveries: [],
    telegram_delivery_log: [],
    telegram_rate_limits: [],
  };

  return (tables[table] ?? []).map((item) => ({ ...item }));
}
