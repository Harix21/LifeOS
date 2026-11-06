import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Activity, ArrowRight, Bell, BookOpen, BookOpenCheck, BriefcaseBusiness, CalendarDays, CreditCard, Droplets,
  Eye, EyeOff, Fingerprint,
  Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Dumbbell, Download, Flame, LayoutDashboard,
  Heart, Leaf, LogOut, Mail, Menu, Moon, Plus, Search, Settings, Sun, Target, Trash2, UserRound, Wallet, X,
  Zap, Sparkles, Maximize2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import type { UseFormRegisterReturn } from "react-hook-form";
import { z } from "zod";
import { addDays, addMonths, addYears, format } from "date-fns";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { PersonalWorkspace } from "./components/personal/PersonalWorkspace";
import { FitnessWorkspace } from "./components/fitness/FitnessWorkspace";
import { FinanceWorkspace } from "./components/finance/FinanceWorkspace";
import { ProjectsWorkspace } from "./components/projects/ProjectsWorkspace";
import { DEMO_USER_ID, getDemoPreferences, getDemoProfile, getDemoRows } from "./demoData";
import {
  cacheServerRows, clearPendingMutations, enqueueDelete, enqueueRpc,
  enqueueUpsert, getCachedRows, readCachedSingle, subscribeToLocalChanges,
  syncAfterLocalWrite,
} from "./offline/offlineDatabase";
import type { OfflineRecordChange } from "./offline/offlineDatabase";
import { cancelDeviceReminders, requestDeviceNotificationPermission, scheduleDeviceReminders } from "./offline/localNotifications";

type FieldKind = "text" | "textarea" | "date" | "datetime-local" | "number" | "select" | "checkbox" | "time" | "url" | "relation";
type Field = {
  name: string;
  label: string;
  type?: FieldKind;
  required?: boolean;
  sensitive?: boolean;
  options?: string[];
  relationTable?: string;
  relationLabel?: string;
  min?: number;
};
type Resource = {
  key: string;
  label: string;
  table: string;
  display: string;
  fields: Field[];
};
type Row = { id: string; user_id: string; created_at?: string; updated_at?: string; [key: string]: unknown };
type LoanGroup = {
  key: string;
  personName: string;
  direction: "borrowed" | "lent";
  entries: Row[];
  outstandingAmount: number;
};
type Theme = "light" | "dark" | "system";
type Toast = { id: number; text: string; error?: boolean };
type DemoSession = { demo: true; user: { id: string; email: string; user_metadata: { display_name: string } } };
type AppSession = Session | DemoSession;
const DEMO_SESSION_KEY = "lifeos-demo-session";

function AppPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}

function isDemoSession(session: AppSession): session is DemoSession {
  return "demo" in session;
}

function createDemoSession(): DemoSession {
  return { demo: true, user: { id: DEMO_USER_ID, email: "demo@lifeos.app", user_metadata: { display_name: "Alex Morgan" } } };
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabase: SupabaseClient | null = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

const resources: Resource[] = [
  { key: "tasks", label: "Tasks", table: "tasks", display: "title", fields: [
    { name: "title", label: "Title", required: true }, { name: "description", label: "Description", type: "textarea" },
    { name: "area", label: "Area", type: "select", options: ["Personal", "Professional", "Fitness", "Finance"], required: true },
    { name: "status", label: "Status", type: "select", options: ["todo", "in_progress", "done", "cancelled"], required: true },
    { name: "recurrence", label: "Repeat", type: "select", options: ["none", "daily", "weekly", "monthly"], required: true },
    { name: "priority", label: "Priority", type: "select", options: ["high", "medium", "low"] }, { name: "due_date", label: "Due date", type: "datetime-local" },
  ] },
  { key: "goals", label: "Goals", table: "goals", display: "title", fields: [
    { name: "title", label: "Goal", required: true }, { name: "area", label: "Area", type: "select", options: ["Personal", "Professional", "Fitness", "Finance"] },
    { name: "description", label: "Description", type: "textarea" }, { name: "target_value", label: "Target value", type: "number", min: 0 },
    { name: "current_value", label: "Current progress", type: "number", min: 0 }, { name: "target_date", label: "Target date", type: "date" },
    { name: "status", label: "Status", type: "select", options: ["active", "completed", "paused"] },
  ] },
  { key: "habits", label: "Habits", table: "habits", display: "name", fields: [
    { name: "name", label: "Habit", required: true }, { name: "description", label: "Description", type: "textarea" },
    { name: "icon", label: "Icon", type: "select", options: ["Flame", "BookOpen", "Dumbbell", "Droplets", "Heart", "Leaf", "Moon", "Sun", "Target", "Zap"] },
    { name: "color", label: "Color", type: "select", options: ["violet", "blue", "teal", "amber", "rose", "green"] },
    { name: "frequency", label: "Frequency", type: "select", options: ["daily", "weekly", "monthly"], required: true }, { name: "reminder_time", label: "Reminder time", type: "time" },
    { name: "is_active", label: "Active", type: "checkbox" },
  ] },
  { key: "habit_completions", label: "Habit check-ins", table: "habit_completions", display: "completed_on", fields: [
    { name: "habit_id", label: "Habit", type: "relation", relationTable: "habits", relationLabel: "name", required: true },
    { name: "completed_on", label: "Completed on", type: "date", required: true }, { name: "note", label: "Note", type: "textarea" },
  ] },
  { key: "journal_entries", label: "Journal", table: "journal_entries", display: "title", fields: [
    { name: "title", label: "Title", required: true }, { name: "entry_date", label: "Date", type: "date", required: true },
    { name: "mood", label: "Mood" }, { name: "body", label: "Entry", type: "textarea", required: true },
  ] },
  { key: "mood_entries", label: "Mood tracker", table: "mood_entries", display: "mood", fields: [
    { name: "mood", label: "Mood", required: true }, { name: "intensity", label: "Intensity (1-10)", type: "number", min: 1 },
    { name: "recorded_at", label: "Recorded at", type: "datetime-local" }, { name: "note", label: "Note", type: "textarea" },
  ] },
  { key: "projects", label: "Projects", table: "projects", display: "name", fields: [
    { name: "name", label: "Project name", required: true }, { name: "description", label: "Description", type: "textarea" },
    { name: "status", label: "Status", type: "select", options: ["active", "on_hold", "completed", "archived"] },
    { name: "start_date", label: "Start date", type: "date" }, { name: "target_date", label: "Target date", type: "date" },
  ] },
  { key: "project_milestones", label: "Project milestones", table: "project_milestones", display: "title", fields: [
    { name: "project_id", label: "Project", type: "relation", relationTable: "projects", relationLabel: "name", required: true },
    { name: "title", label: "Milestone", required: true }, { name: "due_date", label: "Due date", type: "date" },
    { name: "completed_at", label: "Completed at", type: "datetime-local" },
  ] },
  { key: "skills", label: "Skills", table: "skills", display: "name", fields: [
    { name: "name", label: "Skill", required: true }, { name: "category", label: "Category" },
    { name: "proficiency", label: "Proficiency (0-100)", type: "number", min: 0 }, { name: "notes", label: "Notes", type: "textarea" },
  ] },
  { key: "job_applications", label: "Job applications", table: "job_applications", display: "role", fields: [
    { name: "company", label: "Company", required: true }, { name: "role", label: "Role", required: true },
    { name: "status", label: "Status", type: "select", options: ["saved", "applied", "interview", "offer", "rejected"] },
    { name: "applied_on", label: "Applied on", type: "date" }, { name: "follow_up_on", label: "Follow-up date", type: "date" },
    { name: "url", label: "Job URL", type: "url" }, { name: "notes", label: "Notes", type: "textarea" },
  ] },
  { key: "time_entries", label: "Time entries", table: "time_entries", display: "title", fields: [
    { name: "title", label: "Activity", required: true }, { name: "project_id", label: "Project", type: "relation", relationTable: "projects", relationLabel: "name" },
    { name: "started_at", label: "Started", type: "datetime-local", required: true }, { name: "ended_at", label: "Ended", type: "datetime-local" },
    { name: "notes", label: "Notes", type: "textarea" },
  ] },
  { key: "fitness_profiles", label: "Fitness profile", table: "fitness_profiles", display: "height_cm", fields: [
    { name: "height_cm", label: "Height (cm)", type: "number", min: 0 }, { name: "target_weight_kg", label: "Target weight (kg)", type: "number", min: 0 },
    { name: "daily_calorie_target", label: "Daily calorie target", type: "number", min: 0 }, { name: "daily_water_target_ml", label: "Daily water target (ml)", type: "number", min: 0 },
  ] },
  { key: "weight_entries", label: "Weight log", table: "weight_entries", display: "weight_kg", fields: [
    { name: "weight_kg", label: "Weight (kg)", type: "number", required: true, min: 0 },
    { name: "recorded_on", label: "Date", type: "date", required: true }, { name: "note", label: "Note", type: "textarea" },
  ] },
  { key: "exercises", label: "Exercises", table: "exercises", display: "name", fields: [
    { name: "name", label: "Exercise", required: true }, { name: "muscle_group", label: "Muscle group" },
    { name: "equipment", label: "Equipment" }, { name: "notes", label: "Notes", type: "textarea" },
  ] },
  { key: "workout_routines", label: "Workout routines", table: "workout_routines", display: "name", fields: [
    { name: "name", label: "Routine", required: true }, { name: "description", label: "Description", type: "textarea" },
  ] },
  { key: "workout_routine_exercises", label: "Routine exercises", table: "workout_routine_exercises", display: "exercise_id", fields: [
    { name: "routine_id", label: "Routine", type: "relation", relationTable: "workout_routines", relationLabel: "name", required: true },
    { name: "exercise_id", label: "Exercise", type: "relation", relationTable: "exercises", relationLabel: "name", required: true },
    { name: "sets", label: "Sets", type: "number", min: 1 }, { name: "reps", label: "Reps", type: "number", min: 1 },
    { name: "position", label: "Order", type: "number", min: 0 },
  ] },
  { key: "workout_sessions", label: "Workout sessions", table: "workout_sessions", display: "title", fields: [
    { name: "title", label: "Workout", required: true }, { name: "routine_id", label: "Routine", type: "relation", relationTable: "workout_routines", relationLabel: "name" },
    { name: "started_at", label: "Started", type: "datetime-local", required: true }, { name: "duration_minutes", label: "Duration (minutes)", type: "number", min: 0 },
    { name: "calories_burned", label: "Calories burned", type: "number", min: 0 }, { name: "notes", label: "Notes", type: "textarea" },
  ] },
  { key: "workout_session_exercises", label: "Session exercises", table: "workout_session_exercises", display: "exercise_name", fields: [
    { name: "session_id", label: "Workout session", type: "relation", relationTable: "workout_sessions", relationLabel: "title", required: true },
    { name: "exercise_id", label: "Exercise", type: "relation", relationTable: "exercises", relationLabel: "name" },
    { name: "exercise_name", label: "Exercise name", required: true }, { name: "sets", label: "Sets", type: "number", min: 1 },
    { name: "reps", label: "Reps", type: "number", min: 1 }, { name: "weight_kg", label: "Weight (kg)", type: "number", min: 0 },
  ] },
  { key: "nutrition_entries", label: "Nutrition", table: "nutrition_entries", display: "description", fields: [
    { name: "description", label: "Food / meal", required: true }, { name: "meal_type", label: "Meal", type: "select", options: ["breakfast", "lunch", "evening", "dinner"], required: true },
    { name: "calories", label: "Calories", type: "number", min: 0 },
    { name: "protein_g", label: "Protein (g)", type: "number", min: 0 }, { name: "carbohydrates_g", label: "Carbohydrates (g)", type: "number", min: 0 },
    { name: "fat_g", label: "Fat (g)", type: "number", min: 0 }, { name: "consumed_at", label: "Consumed at", type: "datetime-local" },
  ] },
  { key: "water_entries", label: "Water log", table: "water_entries", display: "amount_ml", fields: [
    { name: "amount_ml", label: "Amount (ml)", type: "number", required: true, min: 1 }, { name: "consumed_at", label: "Consumed at", type: "datetime-local" },
  ] },
  { key: "financial_accounts", label: "Accounts", table: "financial_accounts", display: "name", fields: [
    { name: "name", label: "Account name", required: true }, { name: "type", label: "Type", type: "select", options: ["checking", "savings", "cash", "investment", "credit"] },
    { name: "currency", label: "Currency", required: true }, { name: "opening_balance", label: "Opening balance", type: "number" },
  ] },
  { key: "transaction_categories", label: "Transaction categories", table: "transaction_categories", display: "name", fields: [
    { name: "name", label: "Category", required: true }, { name: "type", label: "Type", type: "select", options: ["income", "expense"], required: true },
  ] },
  { key: "transactions", label: "Transactions", table: "transactions", display: "title", fields: [
    { name: "title", label: "Description", required: true }, { name: "type", label: "Type", type: "select", options: ["income", "expense"], required: true },
    { name: "amount", label: "Amount", type: "number", required: true, min: 0.01 }, { name: "transaction_date", label: "Date", type: "date", required: true },
    { name: "account_id", label: "Account", type: "relation", relationTable: "financial_accounts", relationLabel: "name" },
    { name: "category_id", label: "Category", type: "relation", relationTable: "transaction_categories", relationLabel: "name" },
    { name: "notes", label: "Notes", type: "textarea" },
  ] },
  { key: "loans", label: "Borrowed & lent", table: "loans", display: "person_name", fields: [
    { name: "person_name", label: "Person", required: true }, { name: "direction", label: "Direction", type: "select", options: ["borrowed", "lent"], required: true },
    { name: "amount", label: "Amount", type: "number", required: true, min: 0.01 }, { name: "loan_date", label: "Date", type: "date", required: true },
    { name: "due_date", label: "Due date", type: "date" }, { name: "is_settled", label: "Settled", type: "checkbox" },
    { name: "settlement_account_id", label: "Settlement account", type: "relation", relationTable: "financial_accounts", relationLabel: "name" },
    { name: "settled_at", label: "Settlement date", type: "date" },
    { name: "notes", label: "Notes", type: "textarea" },
  ] },
  { key: "budgets", label: "Budgets", table: "budgets", display: "name", fields: [
    { name: "name", label: "Budget", required: true }, { name: "category_id", label: "Category", type: "relation", relationTable: "transaction_categories", relationLabel: "name" },
    { name: "amount", label: "Limit", type: "number", required: true, min: 0 }, { name: "period", label: "Period", type: "select", options: ["weekly", "monthly", "yearly"] },
    { name: "starts_on", label: "Starts on", type: "date", required: true },
  ] },
  { key: "savings_goals", label: "Savings goals", table: "savings_goals", display: "name", fields: [
    { name: "name", label: "Goal", required: true }, { name: "target_amount", label: "Target amount", type: "number", required: true, min: 0 },
    { name: "current_amount", label: "Current amount", type: "number", min: 0 }, { name: "target_date", label: "Target date", type: "date" },
  ] },
  { key: "savings_contributions", label: "Savings contributions", table: "savings_contributions", display: "amount", fields: [
    { name: "savings_goal_id", label: "Savings goal", type: "relation", relationTable: "savings_goals", relationLabel: "name", required: true },
    { name: "amount", label: "Contribution", type: "number", required: true, min: 0 }, { name: "contributed_on", label: "Date", type: "date", required: true },
    { name: "note", label: "Note", type: "textarea" },
  ] },
  { key: "recurring_transactions", label: "Recurring transactions", table: "recurring_transactions", display: "title", fields: [
    { name: "title", label: "Bill or income", required: true }, { name: "type", label: "Type", type: "select", options: ["income", "expense"] },
    { name: "amount", label: "Amount", type: "number", required: true, min: 0 }, { name: "frequency", label: "Frequency", type: "select", options: ["weekly", "monthly", "yearly"] },
    { name: "next_due", label: "Next due", type: "date", required: true }, { name: "is_active", label: "Active", type: "checkbox" },
  ] },
  { key: "calendar_events", label: "Calendar events", table: "calendar_events", display: "title", fields: [
    { name: "title", label: "Event", required: true }, { name: "description", label: "Details", type: "textarea" },
    { name: "starts_at", label: "Starts", type: "datetime-local", required: true }, { name: "ends_at", label: "Ends", type: "datetime-local" },
    { name: "area", label: "Area", type: "select", options: ["Personal", "Professional", "Fitness", "Finance"] },
    { name: "reminder_minutes", label: "Reminder (minutes before)", type: "number", min: 0 },
    { name: "recurrence", label: "Repeat", type: "select", options: ["none", "daily", "weekly", "monthly", "yearly"] },
  ] },
  { key: "notifications", label: "Notifications", table: "notifications", display: "title", fields: [
    { name: "title", label: "Notification", required: true }, { name: "body", label: "Details", type: "textarea" },
    { name: "type", label: "Type", required: true }, { name: "scheduled_for", label: "Scheduled for", type: "datetime-local" },
    { name: "read_at", label: "Read at", type: "datetime-local" },
  ] },
  { key: "personal_documents", label: "Personal documents", table: "personal_documents", display: "document_name", fields: [
    { name: "document_name", label: "Document name", required: true },
    { name: "document_type", label: "Document type", type: "select", options: ["aadhaar", "pan", "passport", "driving_license", "voter_id", "other"], required: true },
    { name: "holder_name", label: "Name on document" }, { name: "document_number", label: "Document number", sensitive: true },
    { name: "issuing_authority", label: "Issuing authority" }, { name: "issue_date", label: "Issue date", type: "date" },
    { name: "expiry_date", label: "Expiry date", type: "date" }, { name: "notes", label: "Notes", type: "textarea" },
  ] },
  { key: "payment_cards", label: "Payment cards", table: "payment_cards", display: "card_name", fields: [
    { name: "card_name", label: "Card name", required: true },
    { name: "card_type", label: "Card type", type: "select", options: ["debit", "credit", "prepaid", "forex", "other"], required: true },
    { name: "issuer", label: "Bank / issuer" }, { name: "network", label: "Network" },
    { name: "last_four", label: "Last four digits only", sensitive: true },
    { name: "expiry_date", label: "Expiry date", type: "date" },
    { name: "account_id", label: "Linked account", type: "relation", relationTable: "financial_accounts", relationLabel: "name" },
    { name: "notes", label: "Notes", type: "textarea" },
  ] },
];

const groups = [
  { title: "Personal", icon: UserRound, dashboardKey: "personal_dashboard", items: ["tasks", "goals", "habits", "habit_completions", "mood_entries", "personal_documents", "notifications"] },
  { title: "Fitness", icon: Dumbbell, dashboardKey: "fitness_dashboard", items: ["fitness_profiles", "weight_entries", "workout_sessions", "workout_session_exercises", "workout_routines", "workout_routine_exercises", "exercises", "nutrition_entries", "water_entries"] },
  { title: "Finance", icon: Wallet, dashboardKey: "finance_dashboard", items: ["financial_accounts", "payment_cards", "transactions", "transaction_categories", "budgets", "savings_goals", "savings_contributions", "loans", "recurring_transactions"] },
  { title: "Projects", icon: BriefcaseBusiness, dashboardKey: "project_dashboard", items: ["projects", "project_milestones", "skills", "job_applications", "time_entries"] },
];

const resourceFor = (key: string) => resources.find((resource) => resource.key === key);
const resourceLabel = (key: string) => resourceFor(key)?.label ?? key;
const editFieldNames: Record<string, string[]> = {
  transactions: ["amount"],
  nutrition_entries: ["calories", "protein_g", "carbohydrates_g", "fat_g"],
  water_entries: ["amount_ml"],
};
function fieldsForRecord(resource: Resource, editing: boolean) {
  const allowedFields = editing ? editFieldNames[resource.key] : undefined;
  return allowedFields ? resource.fields.filter((field) => allowedFields.includes(field.name)) : resource.fields;
}
const areaStyles: Record<string, { icon: LucideIcon; className: string }> = {
  Personal: { icon: UserRound, className: "area-personal" },
  Professional: { icon: BriefcaseBusiness, className: "area-professional" },
  Fitness: { icon: Dumbbell, className: "area-fitness" },
  Finance: { icon: Wallet, className: "area-finance" },
};
const habitIcons: Record<string, LucideIcon> = { Flame, BookOpen, Dumbbell, Droplets, Heart, Leaf, Moon, Sun, Target, Zap };
const taskPriorities = ["high", "medium", "low"] as const;
const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
const journalDataTypes = [
  { key: "tasks", label: "Tasks" },
  { key: "habits", label: "Habit check-ins" },
  { key: "water", label: "Water logs" },
  { key: "nutrition", label: "Nutrition" },
  { key: "transactions", label: "Transactions" },
  { key: "savings", label: "Savings contributions" },
  { key: "budgets", label: "Budget usage" },
  { key: "calendar", label: "Calendar events" },
  { key: "workouts", label: "Workout sessions" },
  { key: "mood", label: "Mood entries" },
] as const;
const defaultJournalDataTypes = journalDataTypes.map((item) => item.key);
const allowedJournalDataTypes = new Set<string>(defaultJournalDataTypes);
type JournalProfileKey = "about" | "personal" | "relationships" | "professional" | "career" | "learning" | "fitness" | "wellbeing" | "finance" | "future";
type JournalBookSettings = {
  title: string;
  subtitle: string;
  author: string;
  coverStyle: "midnight" | "botanical" | "classic" | "minimal";
  includeProfilePages: boolean;
  profile: Record<JournalProfileKey, string>;
};
const defaultJournalBookSettings: JournalBookSettings = {
  title: "My Life, In Chapters",
  subtitle: "A personal record of growth, work, wellbeing, and money",
  author: "",
  coverStyle: "midnight",
  includeProfilePages: true,
  profile: { about: "", personal: "", relationships: "", professional: "", career: "", learning: "", fitness: "", wellbeing: "", finance: "", future: "" },
};
const journalProfileSections: { key: JournalProfileKey; title: string; prompt: string }[] = [
  { key: "about", title: "About me", prompt: "A little about who I am, what matters to me, and the chapter of life I am in…" },
  { key: "personal", title: "Personal life", prompt: "Interests, routines, values, and the things that make life meaningful…" },
  { key: "relationships", title: "Relationships & community", prompt: "People, family, friendships, and communities that matter to me…" },
  { key: "professional", title: "Professional life", prompt: "My work, current responsibilities, and what a fulfilling work life looks like…" },
  { key: "career", title: "Career & work", prompt: "Career direction, milestones, projects, and future ambitions…" },
  { key: "learning", title: "Skills & learning", prompt: "Skills I am building, lessons learned, and subjects I want to explore…" },
  { key: "fitness", title: "Fitness & health", prompt: "Health goals, movement, routines, and how I care for my body…" },
  { key: "wellbeing", title: "Mental wellbeing", prompt: "What helps me feel grounded, supported, and emotionally well…" },
  { key: "finance", title: "Finance", prompt: "Money goals, budgets, savings plans, and financial milestones…" },
  { key: "future", title: "Goals & future", prompt: "The future I am working toward and the next steps I want to take…" },
];
function readJournalBookSettings(value: unknown): JournalBookSettings {
  const saved = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const savedProfile = saved.profile && typeof saved.profile === "object" ? saved.profile as Record<string, unknown> : {};
  const coverStyles = ["midnight", "botanical", "classic", "minimal"] as const;
  return {
    title: typeof saved.title === "string" ? saved.title : defaultJournalBookSettings.title,
    subtitle: typeof saved.subtitle === "string" ? saved.subtitle : defaultJournalBookSettings.subtitle,
    author: typeof saved.author === "string" ? saved.author : defaultJournalBookSettings.author,
    coverStyle: coverStyles.includes(saved.coverStyle as typeof coverStyles[number]) ? saved.coverStyle as JournalBookSettings["coverStyle"] : defaultJournalBookSettings.coverStyle,
    includeProfilePages: typeof saved.includeProfilePages === "boolean" ? saved.includeProfilePages : defaultJournalBookSettings.includeProfilePages,
    profile: Object.fromEntries(journalProfileSections.map(({ key }) => [
      key, typeof savedProfile[key] === "string" ? savedProfile[key] : defaultJournalBookSettings.profile[key],
    ])) as Record<JournalProfileKey, string>,
  };
}
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
}[character] ?? character));
type JournalEbookPage = { date: string; title: string; mood: string; body: string; sections: { title: string; items: string[] }[] };
function journalEbookHtml(settings: JournalBookSettings, pages: JournalEbookPage[], profileName: string, includeActivity: boolean) {
  const author = settings.author.trim() || profileName || "Personal journal";
  const profilePages = settings.includeProfilePages ? journalProfileSections.map(({ key, title }, index) =>
    `<section class="page profile"><p class="eyebrow">ABOUT THE AUTHOR</p><h1>${escapeHtml(title)}</h1><p class="profile-copy">${escapeHtml(settings.profile[key] || "Add your notes for this page in Settings.").replace(/\r?\n/g, "<br>")}</p><span class="page-number">${index + 1}</span></section>`,
  ).join("") : "";
  const pageOffset = settings.includeProfilePages ? journalProfileSections.length : 0;
  const dailyPages = pages.map((page, index) => `<section class="page daily"><p class="eyebrow">${escapeHtml(page.date)}</p><h1>${escapeHtml(page.title)}</h1>${page.mood ? `<p class="mood">${escapeHtml(page.mood)}</p>` : ""}${includeActivity ? page.sections.map((section) => `<section class="activity"><h2>${escapeHtml(section.title)}</h2><ul>${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>`).join("") : ""}<div class="reflection">${escapeHtml(page.body).replace(/\r?\n/g, "<br>") || "<span>No reflection written for this date.</span>"}</div><span class="page-number">${pageOffset + index + 1}</span></section>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(settings.title)}</title><style>
    *{box-sizing:border-box}body{margin:0;background:#eee9df;color:#25251f;font:16px/1.65 Georgia,'Times New Roman',serif}.page{position:relative;min-height:100vh;max-width:800px;margin:32px auto;padding:72px clamp(28px,8vw,88px);background:#fffdf7;box-shadow:0 10px 40px #0002;break-after:page}.cover{display:flex;flex-direction:column;justify-content:center;text-align:center;background:linear-gradient(145deg,#29243a,#56506c);color:#f5edda}.cover.botanical{background:linear-gradient(145deg,#23372e,#71866a)}.cover.classic{background:linear-gradient(145deg,#654a30,#b38a58)}.cover.minimal{background:#f8f5ed;color:#26251f;border:12px solid #d6c9ac}.cover-mark{font-size:42px}.cover h1{font-size:clamp(38px,8vw,70px);font-weight:400;line-height:1.08;margin:26px 0}.cover p{opacity:.82}.cover .author{margin-top:52px;letter-spacing:.14em;text-transform:uppercase;font:12px Arial,sans-serif}.eyebrow{letter-spacing:.2em;text-transform:uppercase;color:#8b7658;font:11px Arial,sans-serif}.profile h1,.daily h1{font-size:38px;font-weight:400}.profile-copy{white-space:pre-wrap;min-height:55vh}.mood{color:#74664d}.activity{margin:24px 0}.activity h2{font:12px Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#81745f}.activity ul{padding-left:20px}.reflection{margin-top:28px;white-space:pre-wrap}.page-number{position:absolute;right:34px;bottom:24px;color:#81745f;font:12px Arial,sans-serif}.empty{color:#81745f}@media(max-width:600px){.page{margin:0 auto;min-height:100svh;padding:50px 25px;box-shadow:none}}@media print{body{background:white}.page{max-width:none;min-height:0;margin:0;padding:18mm;box-shadow:none;break-after:page}.page:last-child{break-after:auto}}
    </style></head><body><section class="page cover ${escapeHtml(settings.coverStyle)}"><div class="cover-mark">✦</div><p class="eyebrow">A PERSONAL JOURNAL</p><h1>${escapeHtml(settings.title)}</h1><p>${escapeHtml(settings.subtitle)}</p><p class="author">${escapeHtml(author)}</p></section>${profilePages}${dailyPages || '<section class="page daily"><p class="empty">Your dated journal pages will appear here as you write.</p></section>'}</body></html>`;
}
const today = () => format(new Date(), "yyyy-MM-dd");
const localDateKey = (date: Date) => format(date, "yyyy-MM-dd");
const recordDateKey = (value: unknown) => {
  if (typeof value !== "string" || !value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : localDateKey(parsed);
};
const configuredDate = (value: Date | string) => {
  const raw = value instanceof Date ? value : /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  const format = document.documentElement.dataset.dateFormat ?? "DD/MM/YYYY";
  return format === "MM/DD/YYYY" ? formatDate(raw, "MM/dd/yyyy") : format === "YYYY-MM-DD" ? formatDate(raw, "yyyy-MM-dd") : formatDate(raw, "dd/MM/yyyy");
};
const formatDate = (date: Date, pattern: string) => format(date, pattern);
const configuredTime = (value: Date | string) => format(new Date(value), document.documentElement.dataset.timeFormat === "24h" ? "HH:mm" : "h:mm a");
const defaultValue = (field: Field, value: unknown): string | number | boolean => {
  if (field.type === "checkbox") return value === undefined ? field.name === "is_active" : Boolean(value);
  if (field.name === "priority" && value === undefined) return "medium";
  if (value === null || value === undefined) return "";
  if (field.type === "datetime-local" && typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      const offset = date.getTimezoneOffset() * 60_000;
      return new Date(date.getTime() - offset).toISOString().slice(0, 16);
    }
  }
  if ((field.type === "date" || field.type === "time") && typeof value === "string") return value.slice(0, field.type === "date" ? 10 : 5);
  return typeof value === "number" ? value : String(value);
};
const displayValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};
const maskedValue = (value: unknown) => {
  const text = String(value ?? "");
  return text ? text.length <= 4 ? "•".repeat(text.length) : `•••• ${text.slice(-4)}` : "—";
};
function expandCalendarEvents(events: Row[], start: Date, end: Date) {
  const occurrences: Row[] = [];
  for (const event of events) {
    const first = new Date(String(event.starts_at));
    if (Number.isNaN(first.getTime())) continue;
    const repeat = String(event.recurrence ?? "none");
    let occurrence = new Date(first);
    if (occurrence < start && repeat === "daily") {
      occurrence.setDate(occurrence.getDate() + Math.ceil((start.getTime() - occurrence.getTime()) / 86_400_000));
    } else if (occurrence < start && repeat === "weekly") {
      occurrence.setDate(occurrence.getDate() + Math.ceil((start.getTime() - occurrence.getTime()) / (7 * 86_400_000)) * 7);
    }
    for (let count = 0; count < 10_000 && occurrence <= end; count += 1) {
      if (occurrence >= start) {
        occurrences.push({ ...event, starts_at: occurrence.toISOString(), occurrence_key: `${event.id}:${occurrence.toISOString()}` });
      }
      if (repeat === "none") break;
      if (repeat === "daily") occurrence = addDays(occurrence, 1);
      else if (repeat === "weekly") occurrence = addDays(occurrence, 7);
      else if (repeat === "monthly") occurrence = addMonths(occurrence, 1);
      else if (repeat === "yearly") occurrence = addYears(occurrence, 1);
      else break;
    }
  }
  return occurrences;
}
const currency = (amount: number, code = "INR") => {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: code, maximumFractionDigits: 0 }).format(amount); }
  catch { return `${code} ${amount.toLocaleString()}`; }
};
const loanCurrency = (amount: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount);

async function loadRows(table: string, userId: string): Promise<Row[]> {
  if (userId === DEMO_USER_ID) return getDemoRows(table, userId) as Row[];
  if (!supabase) throw new Error("Supabase is not configured.");
  const cached = await getCachedRows(userId, table);
  if (!navigator.onLine) {
    if (cached.ready) return cached.rows as Row[];
    throw new Error("No saved data is available offline yet. Connect to the internet once to download your records.");
  }
  const pageSize = 500;
  const allRows: Row[] = [];
  try {
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.from(table).select("*").eq("user_id", userId)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + pageSize - 1);
      if (error) throw error;
      const page = (data ?? []) as Row[];
      allRows.push(...page);
      if (page.length < pageSize) return await cacheServerRows(userId, table, allRows) as Row[];
    }
  } catch (error) {
    if (cached.ready && (!navigator.onLine || error instanceof TypeError)) return cached.rows as Row[];
    throw error;
  }
}

function useRows(table: string, userId: string, enabled = true) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["rows", userId, table],
    queryFn: () => loadRows(table, userId),
    enabled: Boolean((supabase || userId === DEMO_USER_ID) && enabled),
  });
  useEffect(() => subscribeToLocalChanges(userId, () => {
    void queryClient.invalidateQueries({ queryKey: ["rows", userId, table] });
  }), [queryClient, table, userId]);
  return query;
}

async function loadSingleRow(table: string, userId: string): Promise<Row | null> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const cached = await readCachedSingle(userId, table);
  if (!navigator.onLine) {
    if (cached.ready) return cached.row as Row | null;
    throw new Error("No saved account settings are available offline yet.");
  }
  try {
    const { data, error } = await supabase.from(table).select("*").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    const rows = data ? [{ ...data, id: userId, user_id: userId }] as Row[] : [];
    return (await cacheServerRows(userId, table, rows))[0] as Row | undefined ?? null;
  } catch (error) {
    if (cached.ready && (!navigator.onLine || error instanceof TypeError)) return cached.row as Row | null;
    throw error;
  }
}

async function saveQueuedRow(
  userId: string,
  table: string,
  payload: Record<string, unknown>,
  options: { onConflict?: string; cacheId?: string } = {},
) {
  await enqueueUpsert(userId, table, payload, options);
  return syncQueuedChanges(userId);
}

async function deleteQueuedRow(userId: string, table: string, id: string) {
  await enqueueDelete(userId, table, id);
  return syncQueuedChanges(userId);
}

async function syncQueuedChanges(userId: string) {
  if (!supabase || !navigator.onLine) throw new Error("You are offline. Reconnect to the internet before making changes.");
  const result = await syncAfterLocalWrite(supabase, userId);
  if (result.error) {
    await clearPendingMutations(userId);
    throw new Error(result.error);
  }
  return result;
}

function savedLocallyMessage(label: string, _result: { remaining?: number; error?: string | null }) {
  return `${label} saved to Supabase.`;
}

function groupLoans(rows: Row[]): LoanGroup[] {
  const groups = new Map<string, LoanGroup>();
  for (const row of rows) {
    const personName = String(row.person_name ?? "").trim();
    const direction = row.direction === "lent" ? "lent" : "borrowed";
    const key = `${direction}:${personName.toLocaleLowerCase()}`;
    const group = groups.get(key) ?? { key, personName, direction, entries: [], outstandingAmount: 0 };
    group.entries.push(row);
    if (!row.is_settled) group.outstandingAmount += Number(row.amount ?? 0);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function validateSchema(fields: Field[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) {
    if (field.type === "checkbox") {
      shape[field.name] = z.boolean().optional();
    } else if (field.type === "number") {
      const number = z.coerce.number().finite().refine((value) => field.min === undefined || value >= field.min, `${field.label} must be at least ${field.min ?? 0}`);
      shape[field.name] = field.required
        ? z.preprocess((value) => value === "" ? undefined : value, number)
        : z.preprocess((value) => value === "" || Number.isNaN(value) ? undefined : value, number.optional());
    } else {
      if (field.type === "url") {
        shape[field.name] = field.required
          ? z.string().url("Enter a valid URL")
          : z.union([z.literal(""), z.string().url("Enter a valid URL")]).optional();
      } else {
        let text = z.string();
        if (field.type === "date") {
          text = z.string().refine((value) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && localDateKey(new Date(`${value}T12:00:00`)) === value), "Enter a valid date");
        }
        if (field.type === "datetime-local") text = z.string().refine((value) => !value || !Number.isNaN(new Date(value).getTime()), "Enter a valid date and time");
        if (field.type === "time") text = z.string().refine((value) => !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value), "Enter a valid time");
        if (field.type === "select" && field.options) text = z.string().refine((value) => field.options?.includes(value) ?? false, "Choose a listed option");
        if (field.type === "relation") text = z.string().uuid("Choose a valid related record");
        shape[field.name] = field.required
          ? text.refine((value) => value.trim().length > 0, `${field.label} is required`)
          : z.preprocess((value) => value === "" ? undefined : value, text.optional());
      }
    }
  }
  return z.object(shape);
}

function cleanFormValues(values: Record<string, unknown>, fields: Field[]) {
  const cleaned: Record<string, unknown> = {};
  for (const field of fields) {
    let value = values[field.name];
    if ((typeof value === "string" && value.trim() === "") || (typeof value === "number" && Number.isNaN(value))) value = null;
    if (field.type === "datetime-local" && typeof value === "string") value = new Date(value).toISOString();
    if (value !== undefined) cleaned[field.name] = value;
  }
  return cleaned;
}

function App() {
  const [session, setSession] = useState<AppSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useLayoutEffect(() => {
    const savedTheme = localStorage.getItem("lifeos-theme");
    const updateTheme = () => {
      document.documentElement.dataset.theme = savedTheme === "light" || savedTheme === "dark"
        ? savedTheme
        : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    };
    updateTheme();
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", updateTheme);
    return () => mediaQuery.removeEventListener("change", updateTheme);
  }, []);

  useEffect(() => {
    const storedDemo = localStorage.getItem(DEMO_SESSION_KEY) === "true";
    if (!supabase) {
      if (storedDemo) setSession(createDemoSession());
      setAuthLoading(false);
      return;
    }
    let alive = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error) setAuthError(error.message);
      setSession(storedDemo ? createDemoSession() : data.session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(localStorage.getItem(DEMO_SESSION_KEY) === "true" ? createDemoSession() : nextSession);
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      setAuthLoading(false);
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  if (authLoading) return <div className="full-screen"><span className="spinner" />Loading your session…</div>;
  if (!session && !supabase) return <PublicSite onLogin={() => setAuthError("")} onDemo={() => { localStorage.setItem(DEMO_SESSION_KEY, "true"); setSession(createDemoSession()); }} setup />;
  if (!session) return <PublicSite onLogin={() => setAuthError("")} onDemo={() => { localStorage.setItem(DEMO_SESSION_KEY, "true"); setSession(createDemoSession()); }} authError={authError} />;
  if (passwordRecovery && !isDemoSession(session)) return <PasswordUpdateScreen onDone={() => setPasswordRecovery(false)} />;
  return <Routes><Route path="*" element={<Workspace session={session} onExitDemo={() => {
    if (!supabase) { setSession(null); return; }
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) setAuthError(error.message);
      setSession(data.session);
    });
  }} />} /></Routes>;
}

function PasswordUpdateScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase || saving) return;
    setSaving(true);
    setMessage("");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setMessage(error.message);
    else onDone();
    setSaving(false);
  }
  return <main className="auth-page"><section className="auth-card">
    <div className="brand auth-brand"><img className="auth-logo" src="/lifeos-logo.png" alt="LifeOS" /></div>
    <p className="eyebrow">PASSWORD RESET</p><h1>Choose a new password</h1>
    <form onSubmit={(event) => void submit(event)}><label>New password<input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      {message && <p className="notice" role="alert">{message}</p>}<button className="primary full-width" disabled={saving}>{saving ? "Saving…" : "Update password"}</button></form>
  </section></main>;
}

function DemoSettingsPage({ onExitDemo }: { onExitDemo: () => void }) {
  return <div className="page">
    <div className="title"><div><p className="eyebrow">SAMPLE WORKSPACE</p><h1>Demo settings</h1><p>This sample account is read-only and does not connect to a real user profile.</p></div></div>
    <section className="panel"><PanelHeading title="Explore the demo" detail="Browse sample records across LifeOS. Sign in to manage your own data and preferences." />
      <button className="secondary" onClick={onExitDemo}><LogOut size={15} /> Exit demo</button>
    </section>
  </div>;
}

type PublicFeature = {
  key: string;
  target: string;
  title: string;
  eyebrow: string;
  detail: string;
  icon: LucideIcon;
  points: string[];
};

const publicFeatures: PublicFeature[] = [
  { key: "today", target: "today", title: "Today and Tomorrow", eyebrow: "DAILY FOCUS", detail: "See the next right actions without jumping between separate apps.", icon: CalendarDays, points: ["Tasks, habits, events, health, and money in one timeline", "Clear priorities for today and tomorrow", "Quick add actions when an idea arrives"] },
  { key: "tasks", target: "tasks", title: "Tasks and goals", eyebrow: "GET THINGS DONE", detail: "Turn intentions into organized work with due dates, priorities, and progress.", icon: Check, points: ["Track open, completed, and overdue work", "Group tasks around meaningful goals", "Stay focused with a calm, searchable workspace"] },
  { key: "habits", target: "habits", title: "Habits and routines", eyebrow: "BUILD CONSISTENCY", detail: "Make small actions visible and keep your streaks grounded in real life.", icon: Flame, points: ["Create repeating habits with reminders", "Check in from each habit's own calendar", "Review consistency over time"] },
  { key: "calendar", target: "calendar", title: "Calendar and events", eyebrow: "SEE YOUR TIME", detail: "Keep appointments, deadlines, and recurring plans in one reliable calendar.", icon: CalendarDays, points: ["Create events with dates and reminders", "Review your week at a glance", "Connect calendar context to daily planning"] },
  { key: "money", target: "finance_dashboard", title: "Money dashboard", eyebrow: "FINANCIAL CLARITY", detail: "Understand where your money is going and what you are building toward.", icon: Wallet, points: ["See account balances from real transactions", "Review income, spending, and monthly net", "Keep financial decisions connected to your goals"] },
  { key: "accounts", target: "accounts", title: "Accounts and transactions", eyebrow: "TRACK EVERY RUPEE", detail: "Record transactions once and let LifeOS keep account balances accurate.", icon: CreditCard, points: ["Income and expense records by account", "Balances derived from transaction history", "Useful categories for reports and reviews"] },
  { key: "savings", target: "savings_goals", title: "Savings plans", eyebrow: "GROW INTENTIONALLY", detail: "Connect contributions to existing saving plans so every deposit moves the right goal.", icon: Target, points: ["Create goals with target amounts and dates", "Add contributions to the selected existing plan", "See progress reflected immediately"] },
  { key: "fitness", target: "fitness_dashboard", title: "Fitness and health", eyebrow: "CARE FOR YOUR BODY", detail: "Bring workouts, water, food, and health signals into your daily rhythm.", icon: Dumbbell, points: ["Log workouts and body measurements", "Track water and food entries", "Use reminders to make healthy actions easier"] },
  { key: "projects", target: "project_dashboard", title: "Projects", eyebrow: "MAKE PROGRESS", detail: "Move professional and personal projects forward with a clear home for every moving part.", icon: BriefcaseBusiness, points: ["Organize projects and milestones", "Keep related tasks together", "Review progress without losing the details"] },
  { key: "journal", target: "journal_entries", title: "Journal", eyebrow: "REFLECT AND RESET", detail: "Capture thoughts, decisions, and daily context in a private journal.", icon: BookOpen, points: ["Write daily entries with your own tone", "Review reflections alongside your routines", "Keep your personal record organized and private"] },
  { key: "notifications", target: "notifications", title: "Smart notifications", eyebrow: "REMEMBER FOR YOU", detail: "Get timely reminders for habits, water, food, expenses, tasks, and events.", icon: Bell, points: ["Android reminders for recurring routines", "Overdue and upcoming task notifications", "A notification center for anything that needs attention"] },
  { key: "settings", target: "settings", title: "Settings and security", eyebrow: "MAKE IT YOURS", detail: "Control preferences, appearance, account security, exports, and integrations.", icon: Settings, points: ["Light and dark theme options", "Google sign-in, email verification, and password reset", "Notification, currency, and profile preferences"] },
];

function PublicSite({ onLogin, onDemo, authError, setup = false }: { onLogin: () => void; onDemo: () => void; authError?: string; setup?: boolean }) {
  const [view, setView] = useState<"home" | "auth" | "tutorial" | "contact" | "feature">(setup ? "home" : "home");
  const [featureKey, setFeatureKey] = useState(publicFeatures[0].key);
  const feature = publicFeatures.find((item) => item.key === featureKey) ?? publicFeatures[0];
  const openFeature = (key: string) => { setFeatureKey(key); setView("feature"); };
  if (view === "auth") return <><button className="public-back" onClick={() => setView("home")}>← Back to LifeOS</button><AuthScreen initialError={authError ?? ""} onDemo={onDemo} /></>;
  return <main className="public-site">
    <header className="public-nav"><button className="public-brand" onClick={() => setView("home")}><img src="/icons/lifeos-mark.png" alt="" /> LifeOS</button>
      <nav><button onClick={() => setView("home")}>Features</button><button onClick={() => setView("tutorial")}>Tutorial</button><button onClick={() => setView("contact")}>Contact</button><button className="secondary" onClick={() => { onLogin(); setView("auth"); }}>Log in</button></nav>
    </header>
    {view === "tutorial" ? <TutorialPage publicPage onBack={() => setView("home")} onFeature={openFeature} /> : view === "contact" ? <ContactPage onBack={() => setView("home")} /> : view === "feature" ? <PublicFeaturePage feature={feature} onBack={() => setView("tutorial")} onLogin={() => { onLogin(); setView("auth"); }} /> : <><section className="landing-hero">
      <div className="landing-copy"><p className="eyebrow">ONE CALM PLACE FOR YOUR WHOLE LIFE</p><h1>Make space for what matters.</h1><p>LifeOS brings your plans, habits, health, projects, and money into one thoughtful workspace.</p>
        <div className="landing-actions"><button className="primary" onClick={() => { onLogin(); setView("auth"); }}>Get started <ArrowRight size={15} /></button><button className="secondary" onClick={() => setView("tutorial")}><BookOpenCheck size={15} /> See how it works</button></div>
        <div className="landing-downloads"><span><b>Web app</b><small>Use LifeOS on desktop or mobile browser</small></span><span><b>Android app</b><small>Take your routines with you</small></span></div>
      </div>
      <div className="hero-visual"><div className="hero-orbit hero-orbit-one" /><div className="hero-orbit hero-orbit-two" /><div className="hero-focus-card"><div className="hero-focus-icon"><Sparkles size={20} /></div><p className="eyebrow">YOUR LIFE, IN FOCUS</p><h2>One calm place for every next step.</h2><div className="hero-focus-metrics"><span><b>12</b><small>life areas</small></span><span><b>1</b><small>clear workspace</small></span><span><b>0</b><small>cost to start</small></span></div></div><div className="hero-float hero-float-task"><Check size={15} /><span><b>Task complete</b><small>Weekly review</small></span></div><div className="hero-float hero-float-habit"><Flame size={15} /><span><b>7 day streak</b><small>Morning walk</small></span></div></div>
    </section><section className="preview-showcase"><div className="section-heading"><p className="eyebrow">A CLEARER VIEW OF YOUR DAY</p><h2>See your progress at a glance.</h2><p>A living dashboard for the things you want to remember, complete, and grow.</p></div><div className="landing-preview"><div className="preview-top"><span>LifeOS</span><span>Today</span></div><div className="preview-card preview-main"><small>YOUR DAY, CLEARLY</small><h2>A little more intention.</h2><div className="preview-stat"><b>4</b><span>open tasks</span><b>₹12,450</b><span>monthly net</span></div></div><div className="preview-row"><div className="preview-card"><small>HABITS</small><b>3 check-ins today</b></div><div className="preview-card"><small>SAVINGS</small><b>72% toward goal</b></div></div></div></section><section className="sample-workspace"><div className="section-heading"><p className="eyebrow">A GLIMPSE INSIDE</p><h2>Your day, beautifully organized.</h2><p>These sample cards show how LifeOS brings habits, tasks, progress, and time together.</p></div><div className="sample-grid"><article className="sample-panel sample-habits"><div className="sample-panel-head"><span>Today’s habits</span><small>3 of 5 complete</small></div><div className="sample-habit"><span className="sample-check done">✓</span><div><b>Morning walk</b><small>30 minutes</small></div><strong>Done</strong></div><div className="sample-habit"><span className="sample-check done">✓</span><div><b>Drink water</b><small>6 glasses</small></div><strong>Done</strong></div><div className="sample-habit"><span className="sample-check">○</span><div><b>Read for 20 minutes</b><small>Evening routine</small></div><strong>Next</strong></div><div className="sample-progress"><span style={{ width: "68%" }} /></div></article><article className="sample-panel sample-tasks"><div className="sample-panel-head"><span>Focus tasks</span><small>Tuesday, 5 Nov</small></div><div className="sample-task"><span className="priority-dot blue" /><div><b>Review weekly plan</b><small>Personal · 9:00 AM</small></div><Check size={16} /></div><div className="sample-task"><span className="priority-dot orange" /><div><b>Prepare project notes</b><small>Work · Due today</small></div><CircleHelp size={16} /></div><div className="sample-task"><span className="priority-dot green" /><div><b>Transfer savings</b><small>Finance · 6:00 PM</small></div><CircleHelp size={16} /></div></article><article className="sample-panel sample-chart"><div className="sample-panel-head"><span>Weekly overview</span><small>Progress</small></div><div className="bar-chart"><span style={{ height: "42%" }} /><span style={{ height: "65%" }} /><span style={{ height: "52%" }} /><span style={{ height: "82%" }} /><span style={{ height: "70%" }} /><span style={{ height: "92%" }} /><span style={{ height: "58%" }} /></div><div className="chart-labels"><small>Mon</small><small>Tue</small><small>Wed</small><small>Thu</small><small>Fri</small><small>Sat</small><small>Sun</small></div><div className="chart-total"><b>18</b><span>completed actions this week</span></div></article><article className="sample-panel sample-calendar"><div className="sample-panel-head"><span>November 2026</span><small>Calendar</small></div><div className="calendar-week"><small>M</small><small>T</small><small>W</small><small>T</small><small>F</small><small>S</small><small>S</small></div><div className="calendar-days">{["27","28","29","30","31","1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30"].map((day, index) => <span className={index === 9 ? "today-dot" : index === 13 || index === 21 ? "event-dot" : ""} key={`${day}-${index}`}>{day}</span>)}</div></article></div></section><section className="free-banner"><div><Zap size={25} /><div><p className="eyebrow">NO PAYWALL, NO LIMITS</p><h2>LifeOS is completely free.</h2><p>Use the full workspace for your plans, habits, health, projects, calendar, and money at no cost.</p></div></div><button className="primary" onClick={() => { onLogin(); setView("auth"); }}>Get started free <ArrowRight size={15} /></button></section><section className="landing-features"><div className="section-heading"><p className="eyebrow">ONE WORKSPACE, TWELVE WAYS TO HELP</p><h2>Everything has a place.</h2><p>Explore each part of LifeOS before you create your account.</p></div><div className="feature-card-grid">{publicFeatures.map((item) => <button className="feature-card" key={item.key} onClick={() => openFeature(item.key)}><item.icon size={20} /><span>{item.title}</span><small>{item.detail}</small><ArrowRight size={14} /></button>)}</div></section><section className="landing-rhythm"><div><p className="eyebrow">A BETTER DAILY RHYTHM</p><h2>From scattered thoughts to a clear next step.</h2><p>LifeOS gives every part of your life a place to land, then brings the right context back when you need it. Start with today, build routines, and review your progress without the noise.</p><button className="secondary" onClick={() => setView("tutorial")}>Walk through the complete guide <ArrowRight size={15} /></button></div><div className="rhythm-list"><div><span>01</span><b>Capture</b><small>Save tasks, ideas, events, and expenses as they happen.</small></div><div><span>02</span><b>Organize</b><small>Connect records to habits, goals, accounts, and projects.</small></div><div><span>03</span><b>Reflect</b><small>Use dashboards, reports, and your journal to adjust your direction.</small></div></div></section><section className="landing-trust"><div><Zap size={22} /><b>Built for momentum</b><span>Fast actions keep planning lighter.</span></div><div><Heart size={22} /><b>Designed for real life</b><span>Flexible enough for changing days.</span></div><div><Fingerprint size={22} /><b>Private by default</b><span>Your account data stays protected.</span></div></section><section className="landing-cta"><p className="eyebrow">READY WHEN YOU ARE</p><h2>Start with one clear day.</h2><p>Set up your space, choose what matters, and let LifeOS help you keep going.</p><button className="primary" onClick={() => { onLogin(); setView("auth"); }}>Create your LifeOS <ArrowRight size={15} /></button></section></>}
    <footer className="public-footer"><span>© {new Date().getFullYear()} LifeOS</span><button onClick={() => setView("tutorial")}>Complete tutorial</button><button onClick={() => setView("contact")}><Mail size={13} /> Contact</button></footer>
  </main>;
}

function TutorialPage({ publicPage = false, onBack, onNavigate, onFeature }: { publicPage?: boolean; onBack?: () => void; onNavigate?: (target: string) => void; onFeature?: (key: string) => void }) {
  return <main className={`tutorial-page ${publicPage ? "tutorial-public" : "page"}`}><div className="title"><div><p className="eyebrow">LIFEOS GUIDE</p><h1>Everything in one clear rhythm.</h1><p>Choose a step to open the feature it explains. You can skip this guide and return from Tutorial in the navigation.</p></div><div className="tutorial-actions">{onBack && <button className="secondary" onClick={onBack}>Back to home</button>}{onNavigate && <button className="secondary" onClick={() => onNavigate("overview")}>Skip tutorial</button>}</div></div>
    <div className="tutorial-grid">{publicFeatures.map((item, index) => <button className="tutorial-step" key={item.key} onClick={() => onFeature ? onFeature(item.key) : onNavigate?.(item.target)}><span>{String(index + 1).padStart(2, "0")}</span><item.icon size={18} /><div><h2>{item.title}</h2><p>{item.detail}</p></div><ArrowRight size={15} /></button>)}</div>
    <section className="panel tutorial-tip"><BookOpenCheck size={20} /><div><h2>Start small</h2><p>Open any step to begin. Nothing changes until you choose to add or edit your own records.</p></div></section>
  </main>;
}

function PublicFeaturePage({ feature, onBack, onLogin }: { feature: PublicFeature; onBack: () => void; onLogin: () => void }) {
  return <main className="feature-page"><button className="secondary" onClick={onBack}>← Back to tutorial</button><div className="feature-hero"><div><p className="eyebrow">{feature.eyebrow}</p><h1>{feature.title}</h1><p>{feature.detail}</p><button className="primary" onClick={onLogin}>Explore in LifeOS <ArrowRight size={15} /></button></div><div className="feature-icon"><feature.icon size={56} /></div></div><div className="feature-points">{feature.points.map((point) => <div key={point}><Check size={17} /><span>{point}</span></div>)}</div></main>;
}

function ContactPage({ onBack }: { onBack: () => void }) {
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || sending) return;
    setSending(true);
    const form = new FormData(event.currentTarget);
    const { error } = await supabase.functions.invoke("contact-message", { body: { name: form.get("name"), email: form.get("email"), message: form.get("message"), website: form.get("website") } });
    setStatus(error ? `Could not send your message: ${error.message}` : "Thanks — your message has been sent.");
    if (!error) event.currentTarget.reset();
    setSending(false);
  }
  return <main className="contact-page"><div className="title"><div><p className="eyebrow">GET IN TOUCH</p><h1>Tell us what you need.</h1><p>Questions, feedback, or ideas for LifeOS? Send a message and we’ll get back to you.</p></div><button className="secondary" onClick={onBack}>Back to home</button></div>
    <form className="contact-form panel" onSubmit={(event) => void submit(event)}><label>Name<input name="name" required maxLength={100} /></label><label>Email<input name="email" type="email" required maxLength={200} /></label><label className="contact-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label><label>Message<textarea name="message" rows={7} required maxLength={4000} /></label>{status && <p className="notice" role="status">{status}</p>}<button className="primary" disabled={sending}><Mail size={15} />{sending ? "Sending…" : "Send message"}</button></form>
  </main>;
}

function AuthScreen({ initialError, onDemo }: { initialError: string; onDemo: () => void }) {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState(initialError);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase || saving) return;
    setSaving(true);
    setMessage("");
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: name } } });
        if (error) throw error;
        if (data.session) setMessage("Account created and signed in.");
        else {
          setVerificationEmail(email);
          setMessage("Account created. Check your email and click the verification link before signing in.");
        }
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/` });
        if (error) throw error;
        setMessage("If an account exists for this address, a password reset email has been sent.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "Authentication failed.";
      setMessage(/email not confirmed|email.*confirm/i.test(text)
        ? "Please verify your email before signing in. Use the verification link in your inbox."
        : text);
    } finally { setSaving(false); }
  }
  async function signInWithGoogle() {
    if (!supabase || saving) return;
    setSaving(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setMessage(error.message);
      setSaving(false);
    }
  }
  async function resendVerification() {
    if (!supabase || !verificationEmail || saving) return;
    setSaving(true);
    const { error } = await supabase.auth.resend({ type: "signup", email: verificationEmail });
    setMessage(error ? error.message : "A new verification email has been sent.");
    setSaving(false);
  }
  return <main className="auth-page"><section className="auth-card">
    <div className="brand auth-brand"><img className="auth-logo" src="/lifeos-logo.png" alt="LifeOS" /></div>
    <p className="eyebrow">YOUR PERSONAL WORKSPACE</p>
    <h1>{mode === "signup" ? "Create your account" : mode === "reset" ? "Reset your password" : "Welcome back"}</h1>
    <form onSubmit={(event) => void submit(event)}>
      {mode === "signup" && <label>Display name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required /></label>}
      <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      {mode !== "reset" && <label>Password<input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>}
      {message && <p className="notice" role="status">{message}</p>}
      <button className="primary full-width" type="submit" disabled={saving}>{saving ? "Please wait…" : mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}</button>
    </form>
    {mode === "login" && <><div className="auth-divider"><span>or</span></div><button className="secondary full-width" type="button" onClick={() => void signInWithGoogle()} disabled={saving}><span className="google-mark">G</span> Continue with Google</button></>}
    {verificationEmail && mode === "signup" && <button className="text-button" type="button" onClick={() => void resendVerification()} disabled={saving}>Resend verification email</button>}
    <div className="auth-links">
      {mode !== "login" && <button className="text-button" onClick={() => { setMode("login"); setMessage(""); }}>Back to sign in</button>}
      {mode === "login" && <><button className="text-button" onClick={() => { setMode("signup"); setMessage(""); }}>Create account</button><button className="text-button" onClick={() => { setMode("reset"); setMessage(""); }}>Forgot password?</button></>}
    </div>
    {mode === "login" && <button className="secondary full-width" onClick={onDemo}>Explore demo with sample data</button>}
    <p className="muted small">New accounts may require email verification. Your records are isolated by Supabase row-level security.</p>
  </section></main>;
}

function Workspace({ session, onExitDemo }: { session: AppSession; onExitDemo: () => void }) {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("lifeos-theme") as Theme | null) ?? "system");
  const preferenceInitialized = useRef(Boolean(localStorage.getItem("lifeos-theme")));
  const [mobile, setMobile] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [search, setSearch] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [quickAddTarget, setQuickAddTarget] = useState("");
  const [quickAddRequest, setQuickAddRequest] = useState(0);
  const [searchCategory, setSearchCategory] = useState("all");
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [notificationError, setNotificationError] = useState("");
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const searchInput = useRef<HTMLInputElement>(null);
  const user = session.user;
  const demoMode = isDemoSession(session);
  const canWrite = !demoMode;
  const [deviceNotificationsEnabled, setDeviceNotificationsEnabled] = useState(false);
  const appNotifications = useRows("notifications", user.id, !demoMode);
  const unreadNotificationCount = (appNotifications.data ?? []).filter((row) => !row.read_at).length;
  const profileQuery = useQuery({
    queryKey: ["profile", user.id],
    queryFn: async () => {
      if (demoMode) return getDemoProfile(user.id) as Row;
      return loadSingleRow("profiles", user.id);
    },
  });
  const preferenceQuery = useQuery({
    queryKey: ["preferences", user.id],
    queryFn: async () => {
      if (demoMode) return getDemoPreferences(user.id) as Row;
      return loadSingleRow("user_preferences", user.id);
    },
  });
  const displayTheme = theme === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;
  const pathname = location.pathname;
  const pageKey = pathname === "/" ? "overview" : pathname.split("/").filter(Boolean).at(-1) ?? "overview";
  const selectedResource = resourceFor(pageKey);
  const searchResults = useQuery({
    queryKey: ["global-search", user.id, search],
    enabled: search.trim().length >= 2,
    queryFn: async () => {
      const allowed = ["tasks", "projects", "goals", "journal_entries", "transactions", "loans", "calendar_events", "job_applications"];
      const data = await Promise.all(allowed.map(async (table) => ({ table, rows: await loadRows(table, user.id) })));
      const needle = search.trim().toLocaleLowerCase();
      return data.flatMap(({ table, rows }) => rows.filter((row) => Object.values(row).some((value) => String(value ?? "").toLocaleLowerCase().includes(needle)))
        .map((row) => ({ table, row }))).slice(0, 30);
    },
  });
  const visibleSearchResults = (searchResults.data ?? []).filter(({ table }) => searchCategory === "all" || table === searchCategory);
  const reminderTasks = useRows("tasks", user.id, !demoMode && Capacitor.isNativePlatform() && deviceNotificationsEnabled);
  const reminderEvents = useRows("calendar_events", user.id, !demoMode && Capacitor.isNativePlatform() && deviceNotificationsEnabled);
  const reminderBills = useRows("recurring_transactions", user.id, !demoMode && Capacitor.isNativePlatform() && deviceNotificationsEnabled);
  const reminderHabits = useRows("habits", user.id, !demoMode && Capacitor.isNativePlatform() && deviceNotificationsEnabled);
  const reminderNotifications = useRows("notifications", user.id, !demoMode && Capacitor.isNativePlatform() && deviceNotificationsEnabled);
  const reminderWater = useRows("water_entries", user.id, !demoMode && Capacitor.isNativePlatform() && deviceNotificationsEnabled);
  const reminderNutrition = useRows("nutrition_entries", user.id, !demoMode && Capacitor.isNativePlatform() && deviceNotificationsEnabled);
  const reminderTransactions = useRows("transactions", user.id, !demoMode && Capacitor.isNativePlatform() && deviceNotificationsEnabled);

  useEffect(() => {
    const preferenceKey = `lifeos-device-notifications-enabled:${user.id}`;
    const refresh = () => setDeviceNotificationsEnabled(localStorage.getItem(preferenceKey) === "true");
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string }>).detail;
      if (detail?.userId === user.id) refresh();
    };
    refresh();
    window.addEventListener("lifeos-device-notifications-changed", changed);
    return () => window.removeEventListener("lifeos-device-notifications-changed", changed);
  }, [user.id]);

  useEffect(() => {
    if (demoMode || !Capacitor.isNativePlatform()) return;
    const preferenceKey = `lifeos-device-notifications-enabled:${user.id}`;
    if (localStorage.getItem(preferenceKey) !== null) return;
    let active = true;
    void requestDeviceNotificationPermission().then((granted) => {
      if (!active || !granted) return;
      localStorage.setItem(preferenceKey, "true");
      setDeviceNotificationsEnabled(true);
      window.dispatchEvent(new CustomEvent("lifeos-device-notifications-changed", { detail: { userId: user.id } }));
    }).catch((error) => {
      if (active) setNotificationError(error instanceof Error ? error.message : "Could not enable device notifications.");
    });
    return () => { active = false; };
  }, [demoMode, user.id]);

  useEffect(() => {
    let active = true;
    const synchronizeReminders = async () => {
      if (demoMode || !Capacitor.isNativePlatform()) return;
      try {
        if (!deviceNotificationsEnabled) {
          await cancelDeviceReminders(user.id);
          if (active) setNotificationError("");
          return;
        }
        if ([reminderTasks, reminderEvents, reminderBills, reminderHabits, reminderNotifications, reminderWater, reminderNutrition, reminderTransactions]
          .some((query) => query.isLoading || (query.isError && !query.data))) return;
        await scheduleDeviceReminders(user.id, {
          tasks: reminderTasks.data ?? [],
          events: reminderEvents.data ?? [],
          recurringTransactions: reminderBills.data ?? [],
          habits: reminderHabits.data ?? [],
          notifications: reminderNotifications.data ?? [],
          waterEntries: reminderWater.data ?? [],
          nutritionEntries: reminderNutrition.data ?? [],
          transactions: reminderTransactions.data ?? [],
        });
        if (active) setNotificationError("");
      } catch (error) {
        if (active) setNotificationError(error instanceof Error ? `Device reminders could not be updated: ${error.message}` : "Device reminders could not be updated.");
      }
    };
    void synchronizeReminders();
    return () => { active = false; };
  }, [demoMode, deviceNotificationsEnabled, reminderBills.data, reminderBills.isLoading, reminderEvents.data, reminderEvents.isLoading, reminderHabits.data, reminderHabits.isLoading, reminderNotifications.data, reminderNotifications.isLoading, reminderNutrition.data, reminderNutrition.isLoading, reminderTasks.data, reminderTasks.isLoading, reminderTransactions.data, reminderTransactions.isLoading, reminderWater.data, reminderWater.isLoading, user.id]);

  useEffect(() => {
    const onlineHandler = () => setOnline(true);
    const offlineHandler = () => setOnline(false);
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    return () => { window.removeEventListener("online", onlineHandler); window.removeEventListener("offline", offlineHandler); };
  }, []);
  useEffect(() => {
    if (demoMode) return;
    void clearPendingMutations(user.id);
    return undefined;
  }, [demoMode, online, queryClient, user.id]);
  useEffect(() => { setActiveSearchIndex(0); }, [search, searchCategory]);
  useEffect(() => { if (mobileSearchOpen) searchInput.current?.focus(); }, [mobileSearchOpen]);
  useEffect(() => {
    localStorage.setItem("lifeos-theme", theme);
    document.documentElement.dataset.theme = displayTheme;
  }, [displayTheme, theme]);
  useEffect(() => {
    const accent = preferenceQuery.data?.accent_color;
    if (typeof accent === "string" && /^#[0-9a-f]{6}$/i.test(accent)) {
      document.documentElement.style.setProperty("--user-accent", accent);
    }
    if (typeof preferenceQuery.data?.date_format === "string") document.documentElement.dataset.dateFormat = preferenceQuery.data.date_format;
    if (typeof preferenceQuery.data?.time_format === "string") document.documentElement.dataset.timeFormat = preferenceQuery.data.time_format;
  }, [preferenceQuery.data]);
  useEffect(() => {
    if (preferenceQuery.data && !preferenceInitialized.current) {
      const saved = preferenceQuery.data.theme;
      if (saved === "light" || saved === "dark" || saved === "system") {
        setTheme(saved);
        preferenceInitialized.current = true;
      }
    }
  }, [preferenceQuery.data]);
  useEffect(() => {
    if (profileQuery.isSuccess && !onboardingChecked) {
      setShowOnboarding(profileQuery.data?.onboarding_complete !== true);
      setOnboardingChecked(true);
    }
  }, [onboardingChecked, profileQuery.data, profileQuery.isSuccess]);

  function notify(text: string, error = false) {
    setToast({ id: Date.now(), text, error });
    window.setTimeout(() => setToast((current) => current?.text === text ? null : current), 4500);
  }
  const title = selectedResource?.label ?? ({
    overview: "Overview", today: "Today & Tomorrow", personal_dashboard: "Personal",
    fitness_dashboard: "Fitness", finance_dashboard: "Finance", project_dashboard: "Projects",
    calendar: "Calendar", reports: "Analytics & reports", settings: "Settings",
  }[pageKey] ?? "LifeOS");
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";
  const closeMobile = () => setMobile(false);

  async function signOut() {
    if (demoMode) {
      localStorage.removeItem(DEMO_SESSION_KEY);
      queryClient.clear();
      onExitDemo();
      navigate("/");
      return;
    }
    const { error } = await supabase!.auth.signOut();
    if (error) notify(error.message, true);
    else { queryClient.clear(); navigate("/"); }
  }
  function setThemeAndSave(next: Theme) {
    setTheme(next);
    localStorage.setItem("lifeos-theme", next);
    if (demoMode) return;
    void enqueueUpsert(user.id, "user_preferences", { theme: next }, { onConflict: "user_id" })
      .then(() => syncQueuedChanges(user.id))
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ["preferences", user.id] });
      })
      .catch((error) => notify(`Could not save theme: ${error instanceof Error ? error.message : "Unknown storage error."}`, true));
  }
  function navigateTo(key: string) {
    navigate(key === "overview" ? "/" : `/module/${key}`);
    closeMobile();
    setSearch("");
    setMobileSearchOpen(false);
  }
  function openSearchResult(index: number) {
    const result = visibleSearchResults[index];
    if (result) navigateTo(result.table);
  }
  function requestQuickAdd(target: string) {
    if (demoMode) { notify("Demo mode is read-only. Sign in to create or change records."); return; }
    setQuickAddTarget(target);
    setQuickAddRequest((request) => request + 1);
    navigateTo(target);
  }
  function quickAdd() {
    const activeGroup = groups.find((group) => group.dashboardKey === pageKey
      || group.items.includes(pageKey));
    const target = pageKey === "calendar" ? "calendar_events"
      : activeGroup?.title === "Finance" ? "transactions"
        : activeGroup?.title === "Fitness" ? "workout_sessions"
          : activeGroup?.title === "Projects" ? "projects"
            : pageKey === "journal_entries" ? "journal_entries" : "tasks";
    requestQuickAdd(target);
  }

  const activeWorkspace = groups.find((group) => ["Personal", "Fitness", "Finance", "Projects"].includes(group.title)
    && (group.dashboardKey === pageKey || group.items.includes(pageKey)));
  const pageContent = pageKey === "overview" ? <Dashboard userId={user.id} name={String(profileQuery.data?.display_name || user.email?.split("@")[0] || "")} greeting={greeting} onNavigate={navigateTo} onQuickAdd={requestQuickAdd} currencyCode={String(preferenceQuery.data?.currency ?? "INR")} />
    : pageKey === "personal_dashboard" ? <PersonalDashboard userId={user.id} name={String(profileQuery.data?.display_name || "")} onNavigate={navigateTo} onQuickAdd={requestQuickAdd} />
      : pageKey === "fitness_dashboard" ? <FitnessDashboard userId={user.id} onNavigate={navigateTo} onQuickAdd={requestQuickAdd} />
        : pageKey === "project_dashboard" ? <ProjectDashboard userId={user.id} onNavigate={navigateTo} onQuickAdd={requestQuickAdd} />
          : pageKey === "today" ? <TodayPage userId={user.id} currencyCode={String(preferenceQuery.data?.currency ?? "INR")} onNavigate={navigateTo} onQuickAdd={requestQuickAdd} />
            : pageKey === "finance_dashboard" ? <FinanceDashboard userId={user.id} currencyCode={String(preferenceQuery.data?.currency ?? "INR")} onNavigate={navigateTo} />
              : pageKey === "reports" ? <Reports userId={user.id} currencyCode={String(preferenceQuery.data?.currency ?? "INR")} />
                : pageKey === "tutorial" ? <TutorialPage onNavigate={navigateTo} />
                : pageKey === "calendar" ? <CalendarPage userId={user.id} onToast={notify} online={canWrite} weekStartsOn={Number(preferenceQuery.data?.week_starts_on ?? 1)} openRequest={quickAddTarget === "calendar_events" ? quickAddRequest : 0} onQuickAddConsumed={() => setQuickAddTarget("")} />
                : pageKey === "settings" ? isDemoSession(session)
                  ? <DemoSettingsPage onExitDemo={() => void signOut()} />
                  : <SettingsPage userId={user.id} session={session} profile={profileQuery.data} preferences={preferenceQuery.data} theme={theme} setTheme={setThemeAndSave} onToast={notify} onSignOut={signOut} />
                  : pageKey === "tasks" ? <TasksPage userId={user.id} online={canWrite} onToast={notify} openRequest={quickAddTarget === "tasks" ? quickAddRequest : 0} onQuickAddConsumed={() => setQuickAddTarget("")} />
                    : pageKey === "habits" ? <HabitsPage userId={user.id} online={canWrite} onToast={notify} openRequest={quickAddTarget === "habits" ? quickAddRequest : 0} onQuickAddConsumed={() => setQuickAddTarget("")} />
                      : pageKey === "journal_entries" ? <JournalPage userId={user.id} profileName={String(profileQuery.data?.display_name ?? "")} preferences={preferenceQuery.data} onToast={notify} readOnly={demoMode} />
                        : selectedResource ? <RecordsPage key={selectedResource.key} resource={selectedResource} userId={user.id} online={canWrite} onToast={notify} openRequest={quickAddTarget === selectedResource.key ? quickAddRequest : 0} onQuickAddConsumed={() => setQuickAddTarget("")} />
                          : <EmptyState title="Page not found" detail="Choose a module from the navigation." action={<button className="secondary" onClick={() => navigateTo("overview")}>Go to overview</button>} />;
  const workspaceContent = activeWorkspace?.title === "Personal"
    ? <PersonalWorkspace activePage={pageKey} onNavigate={navigateTo}>{pageContent}</PersonalWorkspace>
    : activeWorkspace?.title === "Fitness"
      ? <FitnessWorkspace activePage={pageKey} onNavigate={navigateTo}>{pageContent}</FitnessWorkspace>
      : activeWorkspace?.title === "Finance"
        ? <FinanceWorkspace activePage={pageKey} onNavigate={navigateTo}>{pageContent}</FinanceWorkspace>
        : activeWorkspace?.title === "Projects"
          ? <ProjectsWorkspace activePage={pageKey} onNavigate={navigateTo}>{pageContent}</ProjectsWorkspace>
          : pageContent;

  return <div className={`app ${displayTheme}`}>
    {mobile && <button aria-label="Close navigation" className="scrim" onClick={closeMobile} />}
    <aside className={`sidebar ${mobile ? "show" : ""}`}>
      <div className="brand"><img className="brandicon" src="/icons/lifeos-mark.png" alt="" /> LifeOS<button className="close" aria-label="Close navigation" onClick={closeMobile}><X /></button></div>
      <div className="workspace-label">YOUR WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">
        <button className={`nav-group-title ${pageKey === "overview" ? "nav-group-active" : ""}`} onClick={() => navigateTo("overview")} aria-current={pageKey === "overview" ? "page" : undefined}>
          <LayoutDashboard size={14} /><span>Main dashboard</span>
        </button>
        <button className={`nav-group-title ${pageKey === "today" ? "nav-group-active" : ""}`} onClick={() => navigateTo("today")} aria-current={pageKey === "today" ? "page" : undefined}>
          <CalendarDays size={14} /><span>Today &amp; Tomorrow</span>
        </button>
        {groups.map((group) => <button key={group.title} className={`nav-group-title ${pageKey === group.dashboardKey ? "nav-group-active" : ""}`} onClick={() => navigateTo(group.dashboardKey)} aria-current={pageKey === group.dashboardKey ? "page" : undefined}>
            <group.icon size={14} /><span>{group.title}</span><ChevronRight size={13} className="nav-group-arrow" />
          </button>)}
        <button className={`nav-group-title ${pageKey === "journal_entries" ? "nav-group-active" : ""}`} onClick={() => navigateTo("journal_entries")} aria-current={pageKey === "journal_entries" ? "page" : undefined}>
          <BookOpen size={14} /><span>Journal</span>
        </button>
        <button className={`nav-group-title ${pageKey === "calendar" ? "nav-group-active" : ""}`} onClick={() => navigateTo("calendar")} aria-current={pageKey === "calendar" ? "page" : undefined}>
          <CalendarDays size={14} /><span>Calendar</span>
        </button>
        <button className={`nav-group-title ${pageKey === "reports" ? "nav-group-active" : ""}`} onClick={() => navigateTo("reports")} aria-current={pageKey === "reports" ? "page" : undefined}>
          <Activity size={14} /><span>Analytics</span>
        </button>
        <button className={`nav-group-title ${pageKey === "tutorial" ? "nav-group-active" : ""}`} onClick={() => navigateTo("tutorial")} aria-current={pageKey === "tutorial" ? "page" : undefined}>
          <BookOpenCheck size={14} /><span>Tutorial</span>
        </button>
      </nav>
      <div className="sidebottom">
        <div className={`status ${!online && !demoMode || notificationError ? "offline-status" : ""}`} title={notificationError || undefined}>
          ● {demoMode ? "Demo workspace" : notificationError ? "Needs attention"
            : online ? "Connected to Supabase — changes enabled" : "Offline — changes disabled"}
        </div>
        <button className={`nav ${pageKey === "settings" ? "active" : ""}`} onClick={() => navigateTo("settings")}><Settings size={16} /><span>Settings</span></button>
        <div className="user"><span className="avatar">{(String(profileQuery.data?.display_name || user.email || "U").trim()[0] ?? "U").toUpperCase()}</span>
          <div className="user-info"><b>{String(profileQuery.data?.display_name || "Your workspace")}</b><small>{user.email}</small></div>
          <button className="icon user-logout" aria-label="Sign out" title="Sign out" onClick={() => void signOut()}><LogOut size={15} /></button>
        </div>
      </div>
    </aside>
    <main className="main">
      <header className="topbar">
        <button className="hamb" aria-label="Open navigation" onClick={() => setMobile(true)}><Menu /></button>
        <div className="breadcrumbs">LIFEOS <span>/</span> {title.toUpperCase()}</div>
        <div className="actions">
          <button className="mobile-search-trigger" aria-label="Open search" onClick={() => setMobileSearchOpen((open) => !open)}><Search size={17} /></button>
          <div className={`search-wrap ${mobileSearchOpen ? "search-open" : ""}`}><label className="search"><Search size={16} /><input ref={searchInput} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setActiveSearchIndex((index) => Math.min(index + 1, visibleSearchResults.length - 1)); }
            if (event.key === "ArrowUp") { event.preventDefault(); setActiveSearchIndex((index) => Math.max(index - 1, 0)); }
            if (event.key === "Enter") { event.preventDefault(); openSearchResult(activeSearchIndex); }
            if (event.key === "Escape") { setSearch(""); setMobileSearchOpen(false); }
          }} placeholder="Search your data" aria-label="Search your data" role="combobox" aria-autocomplete="list" aria-expanded={search.trim().length >= 2} aria-controls="global-search-results" aria-activedescendant={visibleSearchResults.length ? `search-result-${activeSearchIndex}` : undefined} /></label>
            {search.trim().length >= 2 && <div className="search-results" id="global-search-results" role="listbox" aria-label="Search results">
              <label className="search-filter">Category<select value={searchCategory} onChange={(event) => setSearchCategory(event.target.value)}>
                <option value="all">All records</option>{["tasks", "projects", "goals", "journal_entries", "transactions", "loans", "calendar_events", "job_applications"].map((table) => <option key={table} value={table}>{resourceLabel(table)}</option>)}
              </select></label>
              {searchResults.isFetching && <div className="search-result muted">Searching your records…</div>}
              {searchResults.error && <div className="search-result error-text">{searchResults.error instanceof Error ? searchResults.error.message : "Search failed."}</div>}
              {visibleSearchResults.length === 0 && !searchResults.isFetching && <div className="search-result muted">No matching records.</div>}
              {visibleSearchResults.map(({ table, row }, index) => <button className={`search-result ${activeSearchIndex === index ? "search-active" : ""}`} id={`search-result-${index}`} role="option" aria-selected={activeSearchIndex === index} key={`${table}:${row.id}`} onMouseEnter={() => setActiveSearchIndex(index)} onClick={() => openSearchResult(index)}>
                <span>{String(row[resourceFor(table)?.display ?? "title"] ?? "Record")}</span><small>{resourceLabel(table)}</small>
              </button>)}
            </div>}
          </div>
          <button className="icon" aria-label={`Switch to ${displayTheme === "dark" ? "light" : "dark"} theme`} onClick={() => setThemeAndSave(displayTheme === "dark" ? "light" : "dark")}>{displayTheme === "dark" ? <Sun /> : <Moon />}</button>
          <button className="icon notification-button" aria-label={`Open notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ""}`} onClick={() => navigateTo("notifications")}><Bell />{unreadNotificationCount > 0 && <span className="notification-badge">{unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}</span>}</button>
          <button className="primary quick-add" disabled={!canWrite} onClick={quickAdd}><Plus size={16} /> Quick add</button>
        </div>
      </header>
      {demoMode && <div className="offline-banner" role="status">Demo workspace · sample data · read-only. <button className="text-button" onClick={() => void signOut()}>Exit demo</button></div>}
      {!demoMode && !online && <div className="offline-banner" role="status">You’re offline. Your data is still visible when available, but changes will not be saved.</div>}
      <div className="content">
        {profileQuery.error && <ErrorState error={profileQuery.error} />}
        {preferenceQuery.error && <ErrorState error={preferenceQuery.error} />}
        {workspaceContent}
      </div>
      <footer className="app-footer"><span>{demoMode ? "Demo workspace · sample data only" : "Private workspace · secured with Supabase RLS"}</span><button className="text-button" onClick={() => notify(demoMode ? "Demo records are sample-only and cannot be changed." : "For account support, contact the administrator of your Supabase project.")}><CircleHelp size={14} /> Help</button></footer>
    </main>
    {toast && <div className={`toast ${toast.error ? "toast-error" : ""}`} role="status">{toast.error ? <X size={15} /> : <Check size={15} />}{toast.text}<button aria-label="Dismiss message" onClick={() => setToast(null)}><X size={14} /></button></div>}
    {showOnboarding && profileQuery.data && <OnboardingDialog userId={user.id} profile={profileQuery.data} onDone={() => { setShowOnboarding(false); void queryClient.invalidateQueries({ queryKey: ["profile", user.id] }); }} onToast={notify} />}
  </div>;
}

function CategoryBadge({ area }: { area: string }) {
  const category = areaStyles[area] ?? areaStyles.Personal;
  const CategoryIcon = category.icon;
  return <span className={`category-badge ${category.className}`}><CategoryIcon size={12} />{area}</span>;
}

function dateRows(rows: Row[], dateFields: string[], date: string) {
  return rows.filter((row) => dateFields.some((field) => recordDateKey(row[field]) === date));
}

function eventsOnDate(rows: Row[], date: string) {
  const start = new Date(`${date}T00:00:00`);
  const end = addDays(start, 1);
  return expandCalendarEvents(rows, start, end).filter((row) => recordDateKey(row.starts_at) === date);
}

function budgetTotals(budgets: Row[], transactions: Row[], date: string) {
  const dateValue = new Date(`${date}T12:00:00`);
  const usage = budgets.map((budget) => {
    const periodStart = new Date(dateValue);
    if (budget.period === "weekly") periodStart.setDate(periodStart.getDate() - 6);
    else if (budget.period === "monthly") periodStart.setDate(1);
    else if (budget.period === "yearly") periodStart.setMonth(0, 1);
    const startsOn = String(budget.starts_on ?? date);
    const from = startsOn > localDateKey(periodStart) ? startsOn : localDateKey(periodStart);
    const spent = transactions.filter((transaction) => transaction.type === "expense"
      && String(transaction.transaction_date) >= from
      && String(transaction.transaction_date) <= date
      && (!budget.category_id || transaction.category_id === budget.category_id))
      .reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0);
    return { name: String(budget.name), amount: Number(budget.amount ?? 0), spent, period: String(budget.period ?? "monthly"), percent: Number(budget.amount) ? Math.round(spent / Number(budget.amount) * 100) : 0 };
  });
  const limit = usage.reduce((sum, item) => sum + item.amount, 0);
  const spent = usage.reduce((sum, item) => sum + item.spent, 0);
  return { usage, limit, spent, percent: limit ? Math.round(spent / limit * 100) : 0 };
}

function DailyRecordLines({ rows, title, display, detail, onNavigate, target }: {
  rows: Row[]; title: string; display: string; detail?: (row: Row) => string; onNavigate: (key: string) => void; target: string;
}) {
  return <section className="daily-section"><div className="daily-section-heading"><h3>{title}</h3><span>{rows.length}</span></div>
    {!rows.length ? <p className="daily-empty">Nothing planned</p> : rows.map((row) => <button className="daily-record" key={row.id} onClick={() => onNavigate(target)}>
      <span className="daily-record-mark" /><span><b>{String(row[display] ?? "Record")}</b>{detail && <small>{detail(row)}</small>}</span>
      {typeof row.priority === "string" && <span className={`badge priority-badge priority-${row.priority}`}>{row.priority}</span>}
    </button>)}
  </section>;
}

function DayAgenda({ date, label, currencyCode, data, onNavigate }: {
  date: string; label: string; currencyCode: string; data: Record<string, Row[]>; onNavigate: (key: string) => void;
}) {
  const tasks = dateRows(data.tasks ?? [], ["due_date"], date).filter((row) => row.status !== "done" && row.status !== "cancelled");
  const events = eventsOnDate(data.calendar ?? [], date);
  const jobs = dateRows(data.jobs ?? [], ["follow_up_on"], date);
  const transactions = dateRows(data.transactions ?? [], ["transaction_date"], date);
  const habits = (data.habits ?? []).filter((row) => row.is_active);
  const completions = dateRows(data.completions ?? [], ["completed_on"], date);
  const water = dateRows(data.water ?? [], ["consumed_at"], date);
  const nutrition = dateRows(data.nutrition ?? [], ["consumed_at"], date);
  const workouts = dateRows(data.workouts ?? [], ["started_at"], date);
  const spent = transactions.filter((row) => row.type === "expense").reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const saved = dateRows(data.savings ?? [], ["contributed_on"], date).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const waterTotal = water.reduce((sum, row) => sum + Number(row.amount_ml ?? 0), 0);
  const calories = nutrition.reduce((sum, row) => sum + Number(row.calories ?? 0), 0);
  const todayBudgets = budgetTotals(data.budgets ?? [], data.transactions ?? [], date);
  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return <section className="panel day-agenda">
    <div className="day-agenda-heading"><p className="eyebrow">{label.toUpperCase()}</p><h2>{dateLabel}</h2></div>
    <div className="daily-summary-stats">
      <div><small>Spent</small><b>{currency(spent, currencyCode)}</b></div>
      <div><small>Saved</small><b>{currency(saved, currencyCode)}</b></div>
      <div><small>Budget spent / limit</small><b>{todayBudgets.limit ? `${currency(todayBudgets.spent, currencyCode)} / ${currency(todayBudgets.limit, currencyCode)}` : "—"}</b></div>
      <div><small>Water</small><b>{waterTotal.toLocaleString()} ml</b></div>
    </div>
    <DailyRecordLines rows={tasks} title="Tasks due" display="title" detail={(row) => `${String(row.area ?? "Personal")} · ${String(row.priority ?? "medium")} priority`} target="tasks" onNavigate={onNavigate} />
    <DailyRecordLines rows={events} title="Calendar" display="title" detail={(row) => configuredTime(String(row.starts_at))} target="calendar" onNavigate={onNavigate} />
    <section className="daily-section"><div className="daily-section-heading"><h3>Habits</h3><span>{completions.length}/{habits.length} checked in</span></div>
      {habits.length ? habits.map((habit) => { const HabitIcon = habitIcons[String(habit.icon)] ?? Flame; return <div className="daily-record daily-record-static" key={habit.id}><span className={`habit-icon habit-color-${String(habit.color ?? "violet")}`}><HabitIcon size={14} /></span><span><b>{String(habit.name)}</b><small>{completions.some((item) => item.habit_id === habit.id) ? "Done" : "Not checked in"}</small></span></div>; }) : <p className="daily-empty">No active habits</p>}
    </section>
    <DailyRecordLines rows={transactions} title="Transactions" display="title" detail={(row) => `${row.type === "income" ? "Income" : "Spent"} · ${currency(Number(row.amount ?? 0), currencyCode)}`} target="transactions" onNavigate={onNavigate} />
    <DailyRecordLines rows={jobs} title="Job follow-ups" display="role" detail={(row) => String(row.company)} target="job_applications" onNavigate={onNavigate} />
    <DailyRecordLines rows={water} title={`Water · ${waterTotal.toLocaleString()} ml`} display="amount_ml" detail={() => "ml"} target="water_entries" onNavigate={onNavigate} />
    <DailyRecordLines rows={nutrition} title={`Nutrition · ${calories.toLocaleString()} kcal`} display="description" detail={(row) => `${Number(row.calories ?? 0).toLocaleString()} kcal`} target="nutrition_entries" onNavigate={onNavigate} />
    <DailyRecordLines rows={workouts} title="Workouts" display="title" detail={(row) => `${Number(row.duration_minutes ?? 0)} minutes`} target="workout_sessions" onNavigate={onNavigate} />
    {todayBudgets.usage.length > 0 && <div className="daily-budget"><div className="daily-section-heading"><h3>Budget usage</h3><button className="text-button" onClick={() => onNavigate("budgets")}>Manage</button></div>
      {todayBudgets.usage.map((budget) => <div className="budget-row" key={budget.name}><div><b>{budget.name}</b><small>{currency(budget.spent, currencyCode)} / {currency(budget.amount, currencyCode)} · {budget.period}</small></div><progress max="100" value={Math.min(budget.percent, 100)} aria-label={`${budget.name} budget ${budget.percent}% used`} /></div>)}
    </div>}
  </section>;
}

function TodayPage({ userId, currencyCode, onNavigate, onQuickAdd }: { userId: string; currencyCode: string; onNavigate: (key: string) => void; onQuickAdd: (key: string) => void }) {
  const [selectedDate, setSelectedDate] = useState(today);
  const tasks = useRows("tasks", userId);
  const habits = useRows("habits", userId);
  const completions = useRows("habit_completions", userId);
  const water = useRows("water_entries", userId);
  const nutrition = useRows("nutrition_entries", userId);
  const transactions = useRows("transactions", userId);
  const savings = useRows("savings_contributions", userId);
  const budgets = useRows("budgets", userId);
  const calendar = useRows("calendar_events", userId);
  const workouts = useRows("workout_sessions", userId);
  const jobs = useRows("job_applications", userId);
  const queries = [tasks, habits, completions, water, nutrition, transactions, savings, budgets, calendar, workouts, jobs];
  const loading = queries.some((query) => query.isLoading);
  const data = {
    tasks: tasks.data ?? [], habits: habits.data ?? [], completions: completions.data ?? [],
    water: water.data ?? [], nutrition: nutrition.data ?? [], transactions: transactions.data ?? [],
    savings: savings.data ?? [], budgets: budgets.data ?? [], calendar: calendar.data ?? [],
    workouts: workouts.data ?? [], jobs: jobs.data ?? [],
  };
  const tomorrow = localDateKey(addDays(new Date(`${selectedDate}T12:00:00`), 1));
  return <div className="page">
    <div className="title"><div><p className="eyebrow">YOUR NEXT TWO DAYS</p><h1>Today & Tomorrow</h1><p>Tasks, habits, health, events, and money—all in one daily view.</p></div>
      <button className="primary" onClick={() => onQuickAdd("tasks")}><Plus size={16} /> Add a task</button></div>
    <div className="daily-date-filter"><label htmlFor="daily-agenda-date">Choose a date<input id="daily-agenda-date" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label>
      {selectedDate !== today() && <button className="secondary" onClick={() => setSelectedDate(today())}>Back to today</button>}</div>
    {queries.filter((query) => query.error).map((query, index) => <ErrorState key={index} error={query.error} onRetry={() => void query.refetch()} />)}
    {loading ? <LoadingState /> : <div className="daily-agenda-grid">
      <DayAgenda date={selectedDate} label={selectedDate === today() ? "Today" : "Selected day"} currencyCode={currencyCode} data={data} onNavigate={onNavigate} />
      <DayAgenda date={tomorrow} label={selectedDate === today() ? "Tomorrow" : "Following day"} currencyCode={currencyCode} data={data} onNavigate={onNavigate} />
    </div>}
  </div>;
}

function FinanceDashboard({ userId, currencyCode, onNavigate }: { userId: string; currencyCode: string; onNavigate: (key: string) => void }) {
  const transactions = useRows("transactions", userId);
  const categories = useRows("transaction_categories", userId);
  const contributions = useRows("savings_contributions", userId);
  const budgets = useRows("budgets", userId);
  const savingsGoals = useRows("savings_goals", userId);
  const loans = useRows("loans", userId);
  const queries = [transactions, categories, contributions, budgets, savingsGoals, loans];
  const error = queries.find((query) => query.error);
  const loading = queries.some((query) => query.isLoading);
  const tx = transactions.data ?? [];
  const saves = contributions.data ?? [];
  const monthStart = `${today().slice(0, 7)}-01`;
  const todayTx = dateRows(tx, ["transaction_date"], today());
  const monthTx = tx.filter((row) => String(row.transaction_date) >= monthStart && String(row.transaction_date) <= today());
  const categoryNames = new Map((categories.data ?? []).map((category) => [String(category.id), String(category.name ?? "Uncategorized")]));
  const categoryTotals = (type: "expense" | "income") => {
    const totals = new Map<string, number>();
    for (const row of monthTx) {
      if (row.type !== type) continue;
      const label = categoryNames.get(String(row.category_id)) ?? "Uncategorized";
      totals.set(label, (totals.get(label) ?? 0) + Number(row.amount ?? 0));
    }
    return [...totals].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };
  const expenseCategoryData = categoryTotals("expense");
  const incomeCategoryData = categoryTotals("income");
  const todaySavings = dateRows(saves, ["contributed_on"], today()).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const monthSavings = saves.filter((row) => String(row.contributed_on) >= monthStart && String(row.contributed_on) <= today()).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const sumType = (rows: Row[], type: string) => rows.filter((row) => row.type === type).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const todayBudget = budgetTotals(budgets.data ?? [], tx, today());
  const openLoans = (loans.data ?? []).filter((row) => !row.is_settled);
  const borrowed = openLoans.filter((row) => row.direction === "borrowed").reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const lent = openLoans.filter((row) => row.direction === "lent").reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const chartData = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(new Date(`${today()}T12:00:00`), index - 6);
    const key = localDateKey(date);
    const dayTransactions = dateRows(tx, ["transaction_date"], key);
    const daySavings = dateRows(saves, ["contributed_on"], key);
    return { day: date.toLocaleDateString(undefined, { weekday: "short" }), spent: sumType(dayTransactions, "expense"), saved: daySavings.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) };
  });
  return <div className="page">
    <div className="title"><div><p className="eyebrow">YOUR MONEY, CLEARLY</p><h1>Finance dashboard</h1><p>Daily and monthly cash flow, budget usage, savings, and money lent or borrowed.</p></div>
      <button className="primary" onClick={() => onNavigate("transactions")}><Plus size={16} /> Transactions</button></div>
    {error && <ErrorState error={error.error} onRetry={() => void error.refetch()} />}
    {loading ? <LoadingState /> : <>
      <div className="finance-summary-grid">
        <section className="panel finance-period-card"><PanelHeading title="Today" detail={configuredDate(today())} />
          <div className="finance-period-values"><div><small>Spent</small><b>{currency(sumType(todayTx, "expense"), currencyCode)}</b></div><div><small>Income</small><b>{currency(sumType(todayTx, "income"), currencyCode)}</b></div><div><small>Saved</small><b>{currency(todaySavings, currencyCode)}</b></div></div>
        </section>
        <section className="panel finance-period-card"><PanelHeading title="This month" detail={new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })} />
          <div className="finance-period-values"><div><small>Spent</small><b>{currency(sumType(monthTx, "expense"), currencyCode)}</b></div><div><small>Income</small><b>{currency(sumType(monthTx, "income"), currencyCode)}</b></div><div><small>Saved</small><b>{currency(monthSavings, currencyCode)}</b></div></div>
        </section>
      </div>
      <div className="finance-dashboard-grid">
        <section className="panel"><PanelHeading title="Spending & savings" detail="Daily totals · last 7 days" />
          {chartData.some((point) => point.spent || point.saved) ? <div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="day" tickLine={false} axisLine={false} /><YAxis /><Tooltip formatter={(value) => currency(Number(value), currencyCode)} /><Legend /><Bar dataKey="spent" name="Spent" fill="#e78b6e" radius={[4, 4, 0, 0]} /><Bar dataKey="saved" name="Saved" fill="#37ad83" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div> : <ChartEmpty text="Log transactions or savings contributions to see this chart." />}
        </section>
        <section className="panel"><PanelHeading title="Expenses by category" detail="Current month · select a category to compare spending" />
          {expenseCategoryData.length ? <div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={expenseCategoryData} layout="vertical" margin={{ left: 18, right: 12 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--line)" /><XAxis type="number" tickLine={false} axisLine={false} /><YAxis type="category" dataKey="label" width={84} tickLine={false} axisLine={false} /><Tooltip formatter={(value) => currency(Number(value), currencyCode)} /><Bar dataKey="value" name="Expense" fill="#e78b6e" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div> : <ChartEmpty text="Add an expense with a category this month to see the breakdown." />}
        </section>
        <section className="panel"><PanelHeading title="Income by category" detail="Current month · category totals" />
          {incomeCategoryData.length ? <div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={incomeCategoryData} layout="vertical" margin={{ left: 18, right: 12 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--line)" /><XAxis type="number" tickLine={false} axisLine={false} /><YAxis type="category" dataKey="label" width={84} tickLine={false} axisLine={false} /><Tooltip formatter={(value) => currency(Number(value), currencyCode)} /><Bar dataKey="value" name="Income" fill="#37ad83" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div> : <ChartEmpty text="Add income with a category this month to see the breakdown." />}
        </section>
        <section className="panel"><PanelHeading title="Budget usage" detail={`Current budget periods · ${currency(todayBudget.spent, currencyCode)} spent of ${currency(todayBudget.limit, currencyCode)} total limits`} action={() => onNavigate("budgets")} actionLabel="Manage budgets" />
          {todayBudget.usage.length ? <div className="budget-list">{todayBudget.usage.map((budget) => <div className="budget-row" key={budget.name}><div><b>{budget.name}</b><small>{currency(budget.spent, currencyCode)} / {currency(budget.amount, currencyCode)} · {budget.percent}%</small></div><progress max="100" value={Math.min(budget.percent, 100)} aria-label={`${budget.name} utilization ${budget.percent}%`} /></div>)}</div> : <ChartEmpty text="Create a budget to track spending against your limits." />}
        </section>
        <section className="panel"><PanelHeading title="Borrowed & lent" detail="Outstanding balances, excluding settled records" action={() => onNavigate("loans")} actionLabel="Manage balances" />
          <div className="loan-summary"><button onClick={() => onNavigate("loans")}><small>You borrowed</small><b>{currency(borrowed, currencyCode)}</b><span>owed by you</span></button><button onClick={() => onNavigate("loans")}><small>You lent</small><b>{currency(lent, currencyCode)}</b><span>owed to you</span></button></div>
        </section>
        <section className="panel"><PanelHeading title="Savings goals" detail="Current progress from your saved goals" action={() => onNavigate("savings_goals")} actionLabel="View goals" />
          {(savingsGoals.data ?? []).length ? (savingsGoals.data ?? []).map((goal) => <div className="budget-row" key={goal.id}><div><b>{String(goal.name)}</b><small>{currency(Number(goal.current_amount ?? 0), currencyCode)} / {currency(Number(goal.target_amount ?? 0), currencyCode)}</small></div><progress max={Math.max(Number(goal.target_amount ?? 0), 1)} value={Number(goal.current_amount ?? 0)} aria-label={`${goal.name} savings progress`} /></div>) : <ChartEmpty text="Create a savings goal to see progress here." />}
        </section>
      </div>
    </>}
  </div>;
}

function JournalAutoSection({ title, rows, display, detail }: { title: string; rows: Row[]; display: string; detail?: (row: Row) => string }) {
  return <section className="journal-auto-section"><h3>{title}<span>{rows.length}</span></h3>
    {rows.length ? rows.map((row) => <div className="journal-auto-line" key={row.id}><b>{String(row[display] ?? "Record")}</b>{detail && <small>{detail(row)}</small>}</div>) : <p>No entries for this date.</p>}
  </section>;
}

function JournalPage({ userId, profileName, preferences, onToast, readOnly = false }: { userId: string; profileName: string; preferences: Row | null | undefined; onToast: (text: string, error?: boolean) => void; readOnly?: boolean }) {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(today);
  const [showOpeningPages, setShowOpeningPages] = useState(true);
  const entries = useRows("journal_entries", userId);
  const capture = Array.isArray(preferences?.journal_data_types)
    ? preferences.journal_data_types.filter((key): key is string => typeof key === "string" && allowedJournalDataTypes.has(key))
    : defaultJournalDataTypes;
  const tasks = useRows("tasks", userId, capture.includes("tasks"));
  const habits = useRows("habits", userId, capture.includes("habits"));
  const completions = useRows("habit_completions", userId, capture.includes("habits"));
  const water = useRows("water_entries", userId, capture.includes("water"));
  const nutrition = useRows("nutrition_entries", userId, capture.includes("nutrition"));
  const transactions = useRows("transactions", userId, capture.includes("transactions"));
  const savings = useRows("savings_contributions", userId, capture.includes("savings"));
  const budgets = useRows("budgets", userId, capture.includes("budgets"));
  const calendar = useRows("calendar_events", userId, capture.includes("calendar"));
  const workouts = useRows("workout_sessions", userId, capture.includes("workouts"));
  const mood = useRows("mood_entries", userId, capture.includes("mood"));
  const queries = [entries, tasks, habits, completions, water, nutrition, transactions, savings, budgets, calendar, workouts, mood];
  const selectedEntry = (entries.data ?? []).find((row) => row.entry_date === selectedDate);
  const [entryTitle, setEntryTitle] = useState("");
  const [entryMood, setEntryMood] = useState("");
  const [entryBody, setEntryBody] = useState("");
  useEffect(() => {
    setEntryTitle(String(selectedEntry?.title ?? `My day · ${configuredDate(selectedDate)}`));
    setEntryMood(String(selectedEntry?.mood ?? ""));
    setEntryBody(String(selectedEntry?.body ?? ""));
  }, [selectedDate, selectedEntry?.body, selectedEntry?.id, selectedEntry?.mood, selectedEntry?.title]);
  const saveEntry = useMutation({
    mutationFn: async () => {
      if (readOnly) throw new Error("Demo mode is read-only. Sign in to edit journal pages.");
      if (!supabase) throw new Error("Supabase is not configured.");
      const payload = { title: entryTitle.trim() || `My day · ${configuredDate(selectedDate)}`, mood: entryMood.trim() || null, body: entryBody, entry_date: selectedDate };
      return saveQueuedRow(userId, "journal_entries", { ...payload, id: selectedEntry?.id ?? crypto.randomUUID() });
    },
    onSuccess: async (result) => { await queryClient.invalidateQueries({ queryKey: ["rows", userId, "journal_entries"] }); onToast(savedLocallyMessage("Journal page", result)); },
    onError: (error) => onToast(`Could not save journal page: ${error.message}`, true),
  });
  const loading = queries.some((query) => query.isLoading);
  const dayTasks = dateRows(tasks.data ?? [], ["due_date", "completed_at"], selectedDate);
  const dayHabits = dateRows(completions.data ?? [], ["completed_on"], selectedDate);
  const dayWater = dateRows(water.data ?? [], ["consumed_at"], selectedDate);
  const dayNutrition = dateRows(nutrition.data ?? [], ["consumed_at"], selectedDate);
  const dayTransactions = dateRows(transactions.data ?? [], ["transaction_date"], selectedDate);
  const daySavings = dateRows(savings.data ?? [], ["contributed_on"], selectedDate);
  const dayEvents = eventsOnDate(calendar.data ?? [], selectedDate);
  const dayWorkouts = dateRows(workouts.data ?? [], ["started_at"], selectedDate);
  const dayMoods = dateRows(mood.data ?? [], ["recorded_at"], selectedDate);
  const usage = budgetTotals(budgets.data ?? [], transactions.data ?? [], selectedDate);
  const theme = ["paper", "midnight", "sage", "lavender"].includes(String(preferences?.journal_theme)) ? String(preferences?.journal_theme) : "midnight";
  const bookSettings = readJournalBookSettings(preferences?.journal_book_settings);
  const shiftDate = (amount: number) => setSelectedDate(localDateKey(addDays(new Date(`${selectedDate}T12:00:00`), amount)));
  const rowsByType: Record<string, { rows: Row[]; fields: string[] }> = {
    tasks: { rows: tasks.data ?? [], fields: ["due_date", "completed_at"] },
    habits: { rows: completions.data ?? [], fields: ["completed_on"] },
    water: { rows: water.data ?? [], fields: ["consumed_at"] },
    nutrition: { rows: nutrition.data ?? [], fields: ["consumed_at"] },
    transactions: { rows: transactions.data ?? [], fields: ["transaction_date"] },
    savings: { rows: savings.data ?? [], fields: ["contributed_on"] },
    budgets: { rows: budgets.data ?? [], fields: [] },
    calendar: { rows: calendar.data ?? [], fields: ["starts_at"] },
    workouts: { rows: workouts.data ?? [], fields: ["started_at"] },
    mood: { rows: mood.data ?? [], fields: ["recorded_at"] },
  };
  const dateSet = new Set((entries.data ?? []).map((entry) => String(entry.entry_date ?? "")).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)));
  capture.forEach((key) => rowsByType[key]?.rows.forEach((row) => rowsByType[key].fields.forEach((field) => {
    const date = recordDateKey(row[field]);
    if (date) dateSet.add(date);
  })));
  const journalPageDates = [...dateSet].sort();
  const visiblePageDates = [...new Set([...journalPageDates, selectedDate])].sort();
  const pageOffset = bookSettings.includeProfilePages ? journalProfileSections.length : 0;
  const selectedPageNumber = pageOffset + visiblePageDates.indexOf(selectedDate) + 1;
  function downloadEbook() {
    const ebookPages = [...dateSet].sort().map((date): JournalEbookPage => {
      const entry = (entries.data ?? []).find((row) => row.entry_date === date);
      const sections: JournalEbookPage["sections"] = [];
      const addSection = (key: string, title: string, rows: Row[], describe: (row: Row) => string) => {
        if (capture.includes(key) && rows.length) sections.push({ title, items: rows.map(describe) });
      };
      addSection("tasks", "Tasks", dateRows(tasks.data ?? [], ["due_date", "completed_at"], date),
        (row) => `${String(row.title ?? "Task")} · ${String(row.status ?? "open").replaceAll("_", " ")}${row.priority ? ` · ${String(row.priority)} priority` : ""}`);
      addSection("habits", "Habit check-ins", dateRows(completions.data ?? [], ["completed_on"], date)
        .map((row) => ({ ...row, name: (habits.data ?? []).find((habit) => habit.id === row.habit_id)?.name ?? "Habit" })),
      (row) => String(row.name));
      addSection("water", "Water", dateRows(water.data ?? [], ["consumed_at"], date), (row) => `${Number(row.amount_ml ?? 0).toLocaleString()} ml`);
      addSection("nutrition", "Nutrition", dateRows(nutrition.data ?? [], ["consumed_at"], date),
        (row) => `${String(row.description ?? "Meal")} · ${Number(row.calories ?? 0).toLocaleString()} kcal`);
      addSection("transactions", "Transactions", dateRows(transactions.data ?? [], ["transaction_date"], date),
        (row) => `${String(row.title ?? "Transaction")} · ${String(row.type)} · ${currency(Number(row.amount ?? 0), String(preferences?.currency ?? "INR"))}`);
      addSection("savings", "Savings", dateRows(savings.data ?? [], ["contributed_on"], date),
        (row) => `${currency(Number(row.amount ?? 0), String(preferences?.currency ?? "INR"))} contribution`);
      addSection("budgets", "Budget usage", budgetTotals(budgets.data ?? [], transactions.data ?? [], date).usage
        .map((item) => ({ ...item, id: item.name, user_id: userId })),
        (row) => `${String(row.name)} · ${currency(Number(row.spent), String(preferences?.currency ?? "INR"))} / ${currency(Number(row.amount), String(preferences?.currency ?? "INR"))}`);
      addSection("calendar", "Calendar", eventsOnDate(calendar.data ?? [], date), (row) => `${String(row.title ?? "Event")} · ${configuredTime(String(row.starts_at))}`);
      addSection("workouts", "Workouts", dateRows(workouts.data ?? [], ["started_at"], date),
        (row) => `${String(row.title ?? "Workout")} · ${Number(row.duration_minutes ?? 0)} minutes`);
      addSection("mood", "Mood", dateRows(mood.data ?? [], ["recorded_at"], date),
        (row) => `${String(row.mood ?? "Mood")}${row.intensity ? ` · Intensity ${String(row.intensity)}/10` : ""}`);
      return {
        date,
        title: String(entry?.title ?? `My day · ${configuredDate(date)}`),
        mood: String(entry?.mood ?? ""),
        body: String(entry?.body ?? ""),
        sections,
      };
    });
    const ebook = journalEbookHtml(bookSettings, ebookPages, profileName, capture.length > 0);
    const url = URL.createObjectURL(new Blob([ebook], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${bookSettings.title.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "lifeos-journal"}-${today()}.html`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    onToast("Journal e-book downloaded. Open it in a browser or print it to PDF.");
  }
  return <div className={`page journal-page journal-theme-${theme}`}>
    <div className="title"><div><p className="eyebrow">YOUR PERSONAL BOOK</p><h1>Journal</h1><p>Each date gathers the activity you selected in Settings, alongside your private reflections.</p></div></div>
    {queries.filter((query) => query.error).map((query, index) => <ErrorState key={index} error={query.error} onRetry={() => void query.refetch()} />)}
    <div className="journal-book">
      <aside className="journal-spine"><span>LifeOS</span><b>JOURNAL</b><small>{selectedDate.slice(0, 4)}</small></aside>
      <div className="journal-paper">
        <div className="journal-toolbar"><button className="icon" aria-label="Previous journal day" onClick={() => shiftDate(-1)}><ChevronLeft size={15} /></button>
          <label className="journal-date-picker"><span className="sr-only">Journal page date</span><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label>
          <button className="icon" aria-label="Next journal day" onClick={() => shiftDate(1)}><ChevronRight size={15} /></button>
          <button className="secondary" onClick={() => setSelectedDate(today())}>Today</button>
          {bookSettings.includeProfilePages && <button className="secondary journal-export-button" aria-expanded={showOpeningPages} onClick={() => setShowOpeningPages((visible) => !visible)}>
            <ChevronDown className={`journal-toggle-icon ${showOpeningPages ? "" : "is-hidden"}`} size={14} />{showOpeningPages ? "Hide opening pages" : "Show opening pages"}
          </button>}
          <button className="secondary journal-export-button" onClick={downloadEbook}><Download size={14} /> E-book</button>
          <button className="secondary journal-export-button" onClick={() => window.print()}>Print / PDF</button>
        </div>
        {showOpeningPages && <><section className={`journal-front-cover journal-cover-${bookSettings.coverStyle}`}><p className="eyebrow">A PERSONAL JOURNAL</p><span className="journal-cover-mark">✦</span><h2>{bookSettings.title}</h2>
          <p>{bookSettings.subtitle}</p><small>{bookSettings.author.trim() || profileName || "Personal journal"}</small></section>
          {bookSettings.includeProfilePages && <div className="journal-profile-pages">{journalProfileSections.map((section, index) => <section className="journal-profile-page" key={section.key}>
            <p className="eyebrow">ABOUT THE AUTHOR</p><h2>{section.title}</h2>
            <p>{bookSettings.profile[section.key] || "Add your notes for this page in Settings."}</p><span className="journal-page-number">{index + 1}</span>
          </section>)}</div>}</>}
        {loading ? <LoadingState compact /> : <>
          <section className="journal-dated-page">
            <div className="journal-page-heading"><p className="eyebrow">PAGE {selectedPageNumber} · DAILY PAGE</p><h2>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</h2>
              <p>{capture.length} activity {capture.length === 1 ? "type" : "types"} included · linked to your original records</p></div>
            {capture.length > 0 && <div className="journal-capture">
            {capture.includes("tasks") && <JournalAutoSection title="Tasks" rows={dayTasks} display="title" detail={(row) => `${String(row.status ?? "open").replaceAll("_", " ")}${row.priority ? ` · ${String(row.priority)} priority` : ""}`} />}
            {capture.includes("habits") && <JournalAutoSection title={`Habit check-ins${(habits.data ?? []).length ? ` · ${dayHabits.length}/${(habits.data ?? []).filter((row) => row.is_active).length}` : ""}`} rows={(habits.data ?? []).filter((habit) => habit.is_active && dayHabits.some((item) => item.habit_id === habit.id))} display="name" />}
            {capture.includes("water") && <JournalAutoSection title={`Water · ${dayWater.reduce((sum, row) => sum + Number(row.amount_ml ?? 0), 0).toLocaleString()} ml`} rows={dayWater} display="amount_ml" detail={() => "ml"} />}
            {capture.includes("nutrition") && <JournalAutoSection title={`Nutrition · ${dayNutrition.reduce((sum, row) => sum + Number(row.calories ?? 0), 0).toLocaleString()} kcal`} rows={dayNutrition} display="description" detail={(row) => `${Number(row.calories ?? 0).toLocaleString()} kcal`} />}
            {capture.includes("transactions") && <JournalAutoSection title="Transactions" rows={dayTransactions} display="title" detail={(row) => `${row.type} · ${currency(Number(row.amount ?? 0), String(preferences?.currency ?? "INR"))}`} />}
            {capture.includes("savings") && <JournalAutoSection title={`Savings · ${currency(daySavings.reduce((sum, row) => sum + Number(row.amount ?? 0), 0), String(preferences?.currency ?? "INR"))}`} rows={daySavings} display="amount" detail={() => "contribution"} />}
            {capture.includes("budgets") && <JournalAutoSection title={`Budget usage · ${currency(usage.spent, String(preferences?.currency ?? "INR"))} / ${currency(usage.limit, String(preferences?.currency ?? "INR"))}`} rows={usage.usage.map((item) => ({ ...item, id: item.name, user_id: userId }))} display="name" detail={(row) => `${currency(Number(row.spent), String(preferences?.currency ?? "INR"))} / ${currency(Number(row.amount), String(preferences?.currency ?? "INR"))}`} />}
            {capture.includes("calendar") && <JournalAutoSection title="Calendar" rows={dayEvents} display="title" detail={(row) => configuredTime(String(row.starts_at))} />}
            {capture.includes("workouts") && <JournalAutoSection title="Workouts" rows={dayWorkouts} display="title" detail={(row) => `${Number(row.duration_minutes ?? 0)} minutes`} />}
            {capture.includes("mood") && <JournalAutoSection title="Mood" rows={dayMoods} display="mood" detail={(row) => row.intensity ? `Intensity ${String(row.intensity)}/10` : String(row.note ?? "")} />}
            </div>}
            <div className="journal-reflection">
              <label>Page title<input value={entryTitle} onChange={(event) => setEntryTitle(event.target.value)} disabled={readOnly} /></label>
              <label>Mood<input value={entryMood} onChange={(event) => setEntryMood(event.target.value)} placeholder="How are you feeling?" disabled={readOnly} /></label>
              <label>Your reflections<textarea value={entryBody} onChange={(event) => setEntryBody(event.target.value)} rows={7} placeholder="Write a thought, note, or reflection for this day…" disabled={readOnly} /></label>
              {readOnly ? <p className="muted small">Sample journal pages are view-only in the demo.</p>
                : <button className="primary" disabled={saveEntry.isPending} onClick={() => saveEntry.mutate()}>{saveEntry.isPending ? "Saving…" : selectedEntry ? "Save page" : "Save journal page"}</button>}
            </div>
            <span className="journal-page-number">{selectedPageNumber}</span>
          </section>
        </>}
      </div>
    </div>
  </div>;
}

function Dashboard({ userId, name, greeting, onNavigate, onQuickAdd, currencyCode }: { userId: string; name: string; greeting: string; onNavigate: (key: string) => void; onQuickAdd: (key: string) => void; currencyCode: string }) {
  const tasks = useRows("tasks", userId);
  const tx = useRows("transactions", userId);
  const goals = useRows("goals", userId);
  const weight = useRows("weight_entries", userId);
  const events = useRows("calendar_events", userId);
  const habits = useRows("habits", userId);
  const completions = useRows("habit_completions", userId);
  const error = [tasks, tx, goals, weight, events, habits, completions].find((query) => query.error);
  const month = today().slice(0, 7);
  const income = (tx.data ?? []).filter((row) => row.type === "income" && String(row.transaction_date ?? "").startsWith(month)).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const expense = (tx.data ?? []).filter((row) => row.type === "expense" && String(row.transaction_date ?? "").startsWith(month)).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const openTasks = (tasks.data ?? []).filter((row) => row.status !== "done" && row.status !== "cancelled");
  const activeGoals = (goals.data ?? []).filter((row) => row.status === "active");
  const latestWeight = [...(weight.data ?? [])].sort((a, b) => String(b.recorded_on).localeCompare(String(a.recorded_on)))[0];
  const todayEvents = (events.data ?? []).filter((row) => String(row.starts_at ?? "").slice(0, 10) === today()).sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
  const taskTrend = useMemo(() => {
    const completed = (tasks.data ?? []).filter((row) => row.status === "done" && typeof row.completed_at === "string");
    if (!completed.length) return [];
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const key = date.toISOString().slice(0, 10);
      return { day: date.toLocaleDateString(undefined, { weekday: "short" }), completed: completed.filter((row) => String(row.completed_at).slice(0, 10) === key).length };
    });
  }, [tasks.data]);
  const habitChecks = (completions.data ?? []).filter((row) => row.completed_on === today()).length;
  return <div className="page">
    <div className="title"><div><p className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).toUpperCase()}</p>
      <h1>{greeting}{name ? `, ${name}` : ""}.</h1><p>Your life, your data. A clear view of what matters next.</p></div>
      <button className="primary" onClick={() => onQuickAdd("tasks")}><Plus size={16} /> Add a task</button></div>
    {error && <ErrorState error={error.error} />}
    {[tasks, tx, goals, weight, events, habits, completions].some((query) => query.isLoading) && <LoadingState />}
    <div className="stats">
      <Stat label="Open tasks" value={openTasks.length} detail="Across all areas" icon={<Check />} onClick={() => onNavigate("tasks")} />
      <Stat label="Monthly net" value={currency(income - expense, currencyCode)} detail={`${currency(income, currencyCode)} income · ${currency(expense, currencyCode)} expenses`} icon={<Wallet />} onClick={() => onNavigate("transactions")} />
      <Stat label="Latest weight" value={latestWeight ? `${latestWeight.weight_kg} kg` : "No entry"} detail={latestWeight ? `Recorded ${String(latestWeight.recorded_on)}` : "Add a weight check-in"} icon={<Dumbbell />} onClick={() => onNavigate("weight_entries")} />
      <Stat label="Active goals" value={activeGoals.length} detail={`${habitChecks} habit check-ins today`} icon={<Target />} onClick={() => onNavigate("goals")} />
    </div>
    <div className="dashboard-grid">
      <section className="panel"><PanelHeading title="Your open tasks" detail={`${openTasks.length} to keep moving`} action={() => onNavigate("tasks")} actionLabel="View all" />
        {tasks.isLoading ? <LoadingState compact /> : openTasks.length === 0 ? <EmptyState title="No open tasks" detail="Add a task when something needs your attention." action={<button className="text-button" onClick={() => onQuickAdd("tasks")}><Plus size={14} /> Create a task</button>} />
          : openTasks.slice(0, 5).map((task) => <div className="data-line" key={task.id}><span className={`task-marker priority-${String(task.priority ?? "medium")}`} /><div className="line-main"><b>{String(task.title)}</b><small>{task.due_date ? `Due ${configuredDate(String(task.due_date).slice(0, 10))}` : "No due date"}</small></div><CategoryBadge area={String(task.area ?? "Personal")} /><span className={`badge priority-badge priority-${String(task.priority ?? "medium")}`}>{String(task.priority ?? "medium")}</span></div>)}
      </section>
      <section className="panel"><PanelHeading title="Completion trend" detail="Completed tasks by day · last 7 days" action={() => onNavigate("reports")} actionLabel="Reports" />
        {taskTrend.length === 0 ? <ChartEmpty text="Complete tasks to see your real productivity trend here." /> : <div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={taskTrend}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="day" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} width={30} /><Tooltip /><Area type="monotone" dataKey="completed" name="Tasks completed" stroke="#6888ee" fill="#6888ee33" /></AreaChart></ResponsiveContainer></div>}
      </section>
      <section className="panel"><PanelHeading title="Today's schedule" detail="Your upcoming calendar events" action={() => onNavigate("calendar")} actionLabel="Open calendar" />
        {todayEvents.length === 0 ? <EmptyState title="Nothing scheduled today" detail="Your calendar is clear. Add an event when you need one." action={<button className="text-button" onClick={() => onQuickAdd("calendar_events")}><Plus size={14} /> Add event</button>} />
          : todayEvents.slice(0, 4).map((event) => <div className="data-line" key={event.id}><span className="event-marker" /><div className="line-main"><b>{String(event.title)}</b><small>{configuredTime(String(event.starts_at))} · {String(event.area)}</small></div></div>)}
      </section>
      <section className="panel"><PanelHeading title="Habits" detail="Check-ins recorded today" action={() => onNavigate("habits")} actionLabel="Manage habits" />
        {habits.data?.filter((habit) => habit.is_active).length ? habits.data.filter((habit) => habit.is_active).slice(0, 5).map((habit) => { const HabitIcon = habitIcons[String(habit.icon)] ?? Flame; return <div className="data-line" key={habit.id}><span className={`habit-icon habit-color-${String(habit.color ?? "violet")}`}><HabitIcon size={15} /></span><div className="line-main"><b>{String(habit.name)}</b><small>{(completions.data ?? []).some((completion) => completion.habit_id === habit.id && completion.completed_on === today()) ? "Done today" : "Not checked in today"}</small></div><span className="badge">{String(habit.frequency)}</span></div>; })
          : <EmptyState title="No habits yet" detail="Create habits to build routines and track your check-ins." action={<button className="text-button" onClick={() => onQuickAdd("habits")}><Plus size={14} /> Add a habit</button>} />}
      </section>
      <section className="panel panel-full"><PanelHeading title="Financial activity" detail={`Real transactions this month · ${currency(income - expense, currencyCode)} net`} action={() => onNavigate("transactions")} actionLabel="View transactions" />
        <FinanceChart rows={tx.data ?? []} currencyCode={currencyCode} loading={tx.isLoading} />
      </section>
    </div>
  </div>;
}

function PersonalDashboard({ userId, name, onNavigate, onQuickAdd }: { userId: string; name: string; onNavigate: (key: string) => void; onQuickAdd: (key: string) => void }) {
  const tasks = useRows("tasks", userId);
  const goals = useRows("goals", userId);
  const habits = useRows("habits", userId);
  const completions = useRows("habit_completions", userId);
  const moods = useRows("mood_entries", userId);
  const queries = [tasks, goals, habits, completions, moods];
  const error = queries.find((query) => query.error);
  const loading = queries.some((query) => query.isLoading);
  const openTasks = (tasks.data ?? []).filter((task) => task.status !== "done" && task.status !== "cancelled" && task.area === "Personal");
  const activeGoals = (goals.data ?? []).filter((goal) => goal.status === "active");
  const activeHabits = (habits.data ?? []).filter((habit) => habit.is_active);
  const todayChecks = (completions.data ?? []).filter((item) => item.completed_on === today());
  const recentMood = [...(moods.data ?? [])].sort((a, b) => String(b.recorded_at).localeCompare(String(a.recorded_at)))[0];
  const trend = Array.from({ length: 7 }, (_, index) => {
    const date = localDateKey(addDays(new Date(`${today()}T12:00:00`), index - 6));
    return { day: format(new Date(`${date}T12:00:00`), "EEE"), completed: (tasks.data ?? []).filter((task) => task.area === "Personal" && task.status === "done" && recordDateKey(task.completed_at) === date).length };
  });
  return <div className="page area-dashboard personal-dashboard">
    <div className="title"><div><p className="eyebrow">PERSONAL SPACE</p><h1>{name ? `${name}’s personal dashboard` : "Personal dashboard"}</h1><p>Everyday priorities, goals, routines, and wellbeing in one calm view.</p></div><button className="primary" onClick={() => onQuickAdd("tasks")}><Plus size={16} /> Quick capture</button></div>
    {error && <ErrorState error={error.error} onRetry={() => void error.refetch()} />}
    {loading ? <LoadingState /> : <>
      <div className="stats">
        <Stat label="Personal tasks" value={openTasks.length} detail="Open and in progress" icon={<Check />} onClick={() => onNavigate("tasks")} />
        <Stat label="Active goals" value={activeGoals.length} detail="Keep your next milestone in sight" icon={<Target />} onClick={() => onNavigate("goals")} />
        <Stat label="Habits today" value={`${todayChecks.length}/${activeHabits.length}`} detail="Daily check-ins completed" icon={<Flame />} onClick={() => onNavigate("habits")} />
        <Stat label="Latest mood" value={recentMood ? String(recentMood.mood) : "Not logged"} detail={recentMood ? configuredDate(String(recentMood.recorded_at)) : "Make a quick check-in"} icon={<Heart />} onClick={() => onNavigate("mood_entries")} />
      </div>
      <div className="area-dashboard-grid">
        <section className="panel"><PanelHeading title="Personal task rhythm" detail="Completed tasks by day · last 7 days" action={() => onNavigate("tasks")} actionLabel="Open tasks" />
          {trend.some((point) => point.completed) ? <div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="day" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip /><Area type="monotone" dataKey="completed" name="Completed" stroke="#7186e8" fill="#7186e833" /></AreaChart></ResponsiveContainer></div> : <ChartEmpty text="Finish a personal task to begin your weekly activity chart." />}</section>
        <section className="panel"><PanelHeading title="Goals in progress" detail="Active goals across every category" action={() => onNavigate("goals")} actionLabel="All goals" />
          {activeGoals.length ? activeGoals.map((goal) => { const target = Number(goal.target_value ?? 0); const current = Number(goal.current_value ?? 0); return <div className="area-progress-row" key={goal.id}><div><b>{String(goal.title)}</b><CategoryBadge area={String(goal.area ?? "Personal")} /><small>{target ? `${Math.round(current / target * 100)}% · ${current} / ${target}` : "Set a target to track progress"}</small></div>{target > 0 && <progress max={target} value={Math.min(current, target)} aria-label={`${String(goal.title)} progress`} />}</div>; }) : <EmptyState title="No active goals yet" detail="Add a goal to make your next milestone visible." action={<button className="text-button" onClick={() => onQuickAdd("goals")}><Plus size={14} /> Add a goal</button>} />}
        </section>
        <section className="panel"><PanelHeading title="Today's routine" detail={`${todayChecks.length} of ${activeHabits.length} active habits checked in`} action={() => onNavigate("habits")} actionLabel="Manage habits" />
          {activeHabits.length ? activeHabits.slice(0, 6).map((habit) => { const Icon = habitIcons[String(habit.icon)] ?? Flame; const checked = todayChecks.some((item) => item.habit_id === habit.id); return <div className="data-line" key={habit.id}><span className={`habit-icon habit-color-${String(habit.color ?? "violet")}`}><Icon size={15} /></span><div className="line-main"><b>{String(habit.name)}</b><small>{checked ? "Complete today" : "Ready for a check-in"}</small></div><span className={`badge ${checked ? "badge-complete" : ""}`}>{checked ? "Done" : "Open"}</span></div>; }) : <ChartEmpty text="Add a habit to start building your routine." />}
        </section>
        <section className="panel"><PanelHeading title="Recent reflections" detail="Latest mood check-ins" action={() => onNavigate("mood_entries")} actionLabel="Mood log" />
          {(moods.data ?? []).length ? [...(moods.data ?? [])].sort((a, b) => String(b.recorded_at).localeCompare(String(a.recorded_at))).slice(0, 4).map((mood) => <div className="data-line" key={mood.id}><span className="area-log-mark mood-log-mark"><Heart size={14} /></span><div className="line-main"><b>{String(mood.mood)}</b><small>{configuredDate(String(mood.recorded_at))}{mood.note ? ` · ${String(mood.note)}` : ""}</small></div>{Number(mood.intensity) > 0 && <span className="badge">{String(mood.intensity)}/10</span>}</div>) : <EmptyState title="No mood entries yet" detail="A quick mood log can help you notice patterns over time." action={<button className="text-button" onClick={() => onQuickAdd("mood_entries")}><Plus size={14} /> Log mood</button>} />}
        </section>
      </div>
    </>}
  </div>;
}

function FitnessDashboard({ userId, onNavigate, onQuickAdd }: { userId: string; onNavigate: (key: string) => void; onQuickAdd: (key: string) => void }) {
  const profile = useRows("fitness_profiles", userId);
  const weights = useRows("weight_entries", userId);
  const workouts = useRows("workout_sessions", userId);
  const water = useRows("water_entries", userId);
  const nutrition = useRows("nutrition_entries", userId);
  const queries = [profile, weights, workouts, water, nutrition];
  const error = queries.find((query) => query.error);
  const loading = queries.some((query) => query.isLoading);
  const fitness = profile.data?.[0];
  const todaysWater = dateRows(water.data ?? [], ["consumed_at"], today()).reduce((sum, item) => sum + Number(item.amount_ml ?? 0), 0);
  const todaysCalories = dateRows(nutrition.data ?? [], ["consumed_at"], today()).reduce((sum, item) => sum + Number(item.calories ?? 0), 0);
  const month = today().slice(0, 7);
  const monthWorkouts = (workouts.data ?? []).filter((item) => String(item.started_at ?? "").startsWith(month));
  const orderedWeights = [...(weights.data ?? [])].sort((a, b) => String(a.recorded_on).localeCompare(String(b.recorded_on))).slice(-10);
  const workoutTrend = Array.from({ length: 7 }, (_, index) => {
    const date = localDateKey(addDays(new Date(`${today()}T12:00:00`), index - 6));
    const sessions = dateRows(workouts.data ?? [], ["started_at"], date);
    return { day: format(new Date(`${date}T12:00:00`), "EEE"), minutes: sessions.reduce((sum, item) => sum + Number(item.duration_minutes ?? 0), 0), sessions: sessions.length };
  });
  const latestWeight = orderedWeights.at(-1);
  const waterTarget = Number(fitness?.daily_water_target_ml ?? 0);
  const calorieTarget = Number(fitness?.daily_calorie_target ?? 0);
  return <div className="page area-dashboard fitness-dashboard">
    <div className="title"><div><p className="eyebrow">FITNESS & WELLBEING</p><h1>Your training dashboard</h1><p>Track training load, body measurements, hydration, and nutrition from your real logs.</p></div><button className="primary" onClick={() => onQuickAdd("workout_sessions")}><Plus size={16} /> Log workout</button></div>
    {error && <ErrorState error={error.error} onRetry={() => void error.refetch()} />}
    {loading ? <LoadingState /> : <>
      <div className="stats fitness-stats">
        <Stat label="Workouts this month" value={monthWorkouts.length} detail={`${monthWorkouts.reduce((sum, item) => sum + Number(item.duration_minutes ?? 0), 0)} minutes logged`} icon={<Dumbbell />} onClick={() => onNavigate("workout_sessions")} />
        <Stat label="Latest weight" value={latestWeight ? `${Number(latestWeight.weight_kg).toLocaleString()} kg` : "No entry"} detail={latestWeight ? `Recorded ${configuredDate(String(latestWeight.recorded_on))}` : "Start your weight log"} icon={<Activity />} onClick={() => onNavigate("weight_entries")} />
        <Stat label="Water today" value={`${todaysWater.toLocaleString()} ml`} detail={waterTarget ? `${Math.min(Math.round(todaysWater / waterTarget * 100), 100)}% of daily target` : "Set a water target in your fitness profile"} icon={<Droplets />} onClick={() => onNavigate("water_entries")} />
        <Stat label="Calories today" value={todaysCalories.toLocaleString()} detail={calorieTarget ? `${calorieTarget.toLocaleString()} kcal daily target` : "Based on your nutrition log"} icon={<Flame />} onClick={() => onNavigate("nutrition_entries")} />
      </div>
      <div className="area-dashboard-grid">
        <section className="panel"><PanelHeading title="Weight trend" detail="Latest 10 recorded measurements" action={() => onNavigate("weight_entries")} actionLabel="Weight log" />
          {orderedWeights.length > 1 ? <div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={orderedWeights.map((item) => ({ day: configuredDate(String(item.recorded_on)), weight: Number(item.weight_kg) }))}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="day" tickLine={false} axisLine={false} /><YAxis domain={["dataMin - 2", "dataMax + 2"]} tickLine={false} axisLine={false} /><Tooltip /><Area type="monotone" dataKey="weight" name="Weight (kg)" stroke="#34a98a" fill="#34a98a33" /></AreaChart></ResponsiveContainer></div> : <ChartEmpty text="Log two or more weigh-ins to see your progress trend." />}</section>
        <section className="panel"><PanelHeading title="Training consistency" detail="Workout minutes by day · last 7 days" action={() => onNavigate("workout_sessions")} actionLabel="Workout log" />
          {workoutTrend.some((point) => point.minutes) ? <div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={workoutTrend}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="day" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey="minutes" name="Minutes" fill="#35a884" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div> : <ChartEmpty text="Log a workout to start tracking training consistency." />}</section>
        <section className="panel"><PanelHeading title="Daily targets" detail="Progress based on today's entries" action={() => onNavigate("fitness_profiles")} actionLabel="Edit profile" />
          <div className="area-progress-row"><div><b>Hydration</b><small>{todaysWater.toLocaleString()} / {waterTarget ? waterTarget.toLocaleString() : "No target"} ml</small></div>{waterTarget > 0 && <progress max={waterTarget} value={Math.min(todaysWater, waterTarget)} aria-label="Hydration target progress" />}</div>
          <div className="area-progress-row"><div><b>Nutrition</b><small>{todaysCalories.toLocaleString()} / {calorieTarget ? calorieTarget.toLocaleString() : "No target"} kcal</small></div>{calorieTarget > 0 && <progress max={calorieTarget} value={Math.min(todaysCalories, calorieTarget)} aria-label="Calorie target progress" />}</div>
          {Number(fitness?.target_weight_kg) > 0 && <div className="area-progress-row"><div><b>Target weight</b><small>{latestWeight ? `${Number(latestWeight.weight_kg)} kg logged · ${String(fitness?.target_weight_kg)} kg target` : `${String(fitness?.target_weight_kg)} kg target`}</small></div></div>}
        </section>
        <section className="panel"><PanelHeading title="Recent workouts" detail="Latest logged training sessions" action={() => onNavigate("workout_sessions")} actionLabel="All workouts" />
          {(workouts.data ?? []).length ? [...(workouts.data ?? [])].sort((a, b) => String(b.started_at).localeCompare(String(a.started_at))).slice(0, 5).map((item) => <div className="data-line" key={item.id}><span className="area-log-mark workout-log-mark"><Dumbbell size={14} /></span><div className="line-main"><b>{String(item.title)}</b><small>{configuredDate(String(item.started_at))} · {Number(item.duration_minutes ?? 0)} min</small></div>{Number(item.calories_burned) > 0 && <span className="badge">{String(item.calories_burned)} kcal</span>}</div>) : <EmptyState title="No workouts logged" detail="Start with a session; your training history and charts will update automatically." action={<button className="text-button" onClick={() => onQuickAdd("workout_sessions")}><Plus size={14} /> Log workout</button>} />}
        </section>
      </div>
    </>}
  </div>;
}

function ProjectDashboard({ userId, onNavigate, onQuickAdd }: { userId: string; onNavigate: (key: string) => void; onQuickAdd: (key: string) => void }) {
  const projects = useRows("projects", userId);
  const milestones = useRows("project_milestones", userId);
  const timeEntries = useRows("time_entries", userId);
  const skills = useRows("skills", userId);
  const jobs = useRows("job_applications", userId);
  const queries = [projects, milestones, timeEntries, skills, jobs];
  const error = queries.find((query) => query.error);
  const loading = queries.some((query) => query.isLoading);
  const projectRows = projects.data ?? [];
  const activeProjects = projectRows.filter((item) => item.status === "active");
  const now = new Date();
  const weekStart = localDateKey(addDays(new Date(`${today()}T12:00:00`), -6));
  const thisWeekEntries = (timeEntries.data ?? []).filter((item) => recordDateKey(item.started_at) >= weekStart && recordDateKey(item.started_at) <= today());
  const trackedMinutes = thisWeekEntries.reduce((sum, item) => {
    if (!item.ended_at) return sum;
    return sum + Math.max(0, (new Date(String(item.ended_at)).getTime() - new Date(String(item.started_at)).getTime()) / 60_000);
  }, 0);
  const dueMilestones = (milestones.data ?? []).filter((item) => !item.completed_at && String(item.due_date ?? "") >= today()).sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
  const statusData = ["active", "on_hold", "completed", "archived"].map((status) => ({ status: status.replaceAll("_", " "), projects: projectRows.filter((project) => project.status === status).length }));
  const monthData = Array.from({ length: 6 }, (_, index) => {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const key = format(monthDate, "yyyy-MM");
    const minutes = (timeEntries.data ?? []).filter((item) => String(item.started_at ?? "").startsWith(key)).reduce((sum, item) => {
      if (!item.ended_at) return sum;
      return sum + Math.max(0, (new Date(String(item.ended_at)).getTime() - new Date(String(item.started_at)).getTime()) / 60_000);
    }, 0);
    return { month: format(monthDate, "MMM"), hours: Math.round(minutes / 6) / 10 };
  });
  return <div className="page area-dashboard project-dashboard">
    <div className="title"><div><p className="eyebrow">PROJECT WORKSPACE</p><h1>Projects & professional work</h1><p>Track active initiatives, milestones, time, skills, and career opportunities.</p></div><button className="primary" onClick={() => onQuickAdd("projects")}><Plus size={16} /> New project</button></div>
    {error && <ErrorState error={error.error} onRetry={() => void error.refetch()} />}
    {loading ? <LoadingState /> : <>
      <div className="stats project-stats">
        <Stat label="Active projects" value={activeProjects.length} detail={`${projectRows.filter((item) => item.status === "on_hold").length} on hold`} icon={<BriefcaseBusiness />} onClick={() => onNavigate("projects")} />
        <Stat label="Milestones ahead" value={dueMilestones.length} detail={dueMilestones[0] ? `Next · ${configuredDate(String(dueMilestones[0].due_date))}` : "No upcoming milestones"} icon={<Target />} onClick={() => onNavigate("project_milestones")} />
        <Stat label="Time this week" value={`${Math.floor(trackedMinutes / 60)}h ${Math.round(trackedMinutes % 60)}m`} detail="From completed time entries" icon={<Activity />} onClick={() => onNavigate("time_entries")} />
        <Stat label="Career pipeline" value={(jobs.data ?? []).filter((job) => !["rejected", "offer"].includes(String(job.status))).length} detail={`${(skills.data ?? []).length} skills tracked`} icon={<BriefcaseBusiness />} onClick={() => onNavigate("job_applications")} />
      </div>
      <div className="area-dashboard-grid">
        <section className="panel"><PanelHeading title="Project portfolio" detail="Projects by current status" action={() => onNavigate("projects")} actionLabel="All projects" />
          {projectRows.length ? <div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={statusData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="status" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey="projects" name="Projects" fill="#7084df" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div> : <ChartEmpty text="Create a project to start tracking your portfolio." />}</section>
        <section className="panel"><PanelHeading title="Time investment" detail="Tracked hours · last 6 months" action={() => onNavigate("time_entries")} actionLabel="Time log" />
          {monthData.some((point) => point.hours) ? <div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={monthData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="month" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><Tooltip formatter={(value) => `${Number(value)} h`} /><Area type="monotone" dataKey="hours" name="Hours" stroke="#d18b53" fill="#d18b5333" /></AreaChart></ResponsiveContainer></div> : <ChartEmpty text="Log completed time entries to see how your effort changes over time." />}</section>
        <section className="panel"><PanelHeading title="Upcoming milestones" detail="Open milestones, nearest due first" action={() => onNavigate("project_milestones")} actionLabel="All milestones" />
          {dueMilestones.length ? dueMilestones.slice(0, 5).map((milestone) => <div className="data-line" key={milestone.id}><span className="area-log-mark milestone-log-mark"><Target size={14} /></span><div className="line-main"><b>{String(milestone.title)}</b><small>{String(projectRows.find((project) => project.id === milestone.project_id)?.name ?? "Project")} · {typeof milestone.due_date === "string" ? configuredDate(milestone.due_date) : "No due date"}</small></div></div>) : <EmptyState title="No upcoming milestones" detail="Add milestones to make project deadlines easier to manage." action={<button className="text-button" onClick={() => onQuickAdd("project_milestones")}><Plus size={14} /> Add milestone</button>} />}
        </section>
        <section className="panel"><PanelHeading title="Active projects" detail="Current delivery focus" action={() => onNavigate("projects")} actionLabel="Manage projects" />
          {activeProjects.length ? activeProjects.slice(0, 5).map((project) => <div className="data-line" key={project.id}><span className="area-log-mark project-log-mark"><BriefcaseBusiness size={14} /></span><div className="line-main"><b>{String(project.name)}</b><small>{typeof project.target_date === "string" ? `Target ${configuredDate(project.target_date)}` : "No target date"}</small></div><span className="badge">Active</span></div>) : <EmptyState title="No active projects" detail="Create a project to organize milestones and time." action={<button className="text-button" onClick={() => onQuickAdd("projects")}><Plus size={14} /> New project</button>} />}
        </section>
      </div>
    </>}
  </div>;
}

function Stat({ label, value, detail, icon, onClick }: { label: string; value: ReactNode; detail: string; icon: ReactNode; onClick: () => void }) {
  return <button className="stat" onClick={onClick}><span className="stat-icon">{icon}</span><small>{label}</small><b>{value}</b><p>{detail}</p></button>;
}

function PanelHeading({ title, detail, action, actionLabel }: { title: string; detail: string; action?: () => void; actionLabel?: string }) {
  return <div className="panel-heading"><div><h2>{title}</h2><p>{detail}</p></div>{action && <button className="text-button" onClick={action}>{actionLabel}</button>}</div>;
}

function FinanceChart({ rows, currencyCode, loading }: { rows: Row[]; currencyCode: string; loading: boolean }) {
  const points = useMemo(() => {
    const grouped = new Map<string, { month: string; income: number; expenses: number }>();
    for (const row of rows) {
      if (typeof row.transaction_date !== "string") continue;
      const month = String(row.transaction_date).slice(0, 7);
      const point = grouped.get(month) ?? { month, income: 0, expenses: 0 };
      if (row.type === "income") point.income += Number(row.amount ?? 0);
      if (row.type === "expense") point.expenses += Number(row.amount ?? 0);
      grouped.set(month, point);
    }
    return [...grouped.values()].sort((a, b) => a.month.localeCompare(b.month)).map((point) => ({ ...point, savings: point.income - point.expenses }));
  }, [rows]);
  if (loading) return <LoadingState compact />;
  if (!points.length) return <ChartEmpty text="Add financial transactions to see income and spending trends. No sample data is shown." />;
  return <div className="chart chart-tall"><ResponsiveContainer width="100%" height="100%"><BarChart data={points}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="month" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><Tooltip formatter={(value) => currency(Number(value), currencyCode)} /><Legend /><Bar dataKey="income" name="Income" fill="#37ad83" radius={[4, 4, 0, 0]} /><Bar dataKey="expenses" name="Expenses" fill="#e78b6e" radius={[4, 4, 0, 0]} /><Bar dataKey="savings" name="Monthly net" fill="#6888ee" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>;
}

function HabitTrendChart({ rows, loading }: { rows: Row[]; loading: boolean }) {
  const points = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = addDays(new Date(), index - 6);
    const dateKey = localDateKey(date);
    return {
      date: dateKey,
      day: format(date, "EEE"),
      checkIns: rows.filter((row) => row.completed_on === dateKey).length,
    };
  }), [rows]);
  if (loading) return <LoadingState compact />;
  if (!points.some((point) => point.checkIns > 0)) return <ChartEmpty text="Check in to a habit to see your daily activity here. No sample data is shown." />;
  return <div className="chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={points} margin={{ left: -16, right: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="day" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""} /><Line type="monotone" dataKey="checkIns" name="Habit check-ins" stroke="#6888ee" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer></div>;
}

function Reports({ userId, currencyCode }: { userId: string; currencyCode: string }) {
  const navigate = useNavigate();
  const [period, setPeriod] = useState("month");
  const [customStart, setCustomStart] = useState(today().slice(0, 8) + "01");
  const [customEnd, setCustomEnd] = useState(today());
  const tasks = useRows("tasks", userId);
  const tx = useRows("transactions", userId);
  const categories = useRows("transaction_categories", userId);
  const budgets = useRows("budgets", userId);
  const goals = useRows("goals", userId);
  const accounts = useRows("financial_accounts", userId);
  const timeEntries = useRows("time_entries", userId);
  const weight = useRows("weight_entries", userId);
  const workouts = useRows("workout_sessions", userId);
  const nutrition = useRows("nutrition_entries", userId);
  const dataQueries = [tasks, tx, categories, budgets, goals, accounts, timeEntries, weight, workouts, nutrition];
  const dataError = dataQueries.find((query) => query.error);
  const start = useMemo(() => {
    const now = new Date();
    if (period === "custom") return customStart;
    if (period === "today") return today();
    if (period === "week") {
      now.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    }
    if (period === "year") return `${now.getFullYear()}-01-01`;
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  }, [customStart, period]);
  const end = period === "custom" ? customEnd : today();
  const inRange = (value: unknown) => {
    const day = String(value ?? "").slice(0, 10);
    return day >= start && day <= end;
  };
  const reportTasks = (tasks.data ?? []).filter((task) => inRange(task.completed_at ?? task.created_at));
  const reportTx = (tx.data ?? []).filter((transaction) => inRange(transaction.transaction_date));
  const reportTimeEntries = (timeEntries.data ?? []).filter((entry) => inRange(entry.started_at));
  const reportWeights = (weight.data ?? []).filter((entry) => inRange(entry.recorded_on));
  const reportWorkouts = (workouts.data ?? []).filter((entry) => inRange(entry.started_at));
  const reportNutrition = (nutrition.data ?? []).filter((entry) => inRange(entry.consumed_at));
  const completed = reportTasks.filter((task) => task.status === "done").length;
  const totalTasks = reportTasks.length;
  const taskByArea = useMemo(() => {
    const map = new Map<string, { area: string; completed: number; open: number }>();
    for (const task of reportTasks) {
      const area = String(task.area ?? "Other");
      const item = map.get(area) ?? { area, completed: 0, open: 0 };
      if (task.status === "done") item.completed += 1;
      else if (task.status !== "cancelled") item.open += 1;
      map.set(area, item);
    }
    return [...map.values()];
  }, [reportTasks]);
  const categoriesById = new Map((categories.data ?? []).map((category) => [String(category.id), String(category.name)]));
  const categorySpending = useMemo(() => {
    const map = new Map<string, number>();
    for (const transaction of reportTx) {
      if (transaction.type === "expense") {
        const key = categoriesById.get(String(transaction.category_id)) ?? "Uncategorized";
        map.set(key, (map.get(key) ?? 0) + Number(transaction.amount ?? 0));
      }
    }
    return [...map].map(([category, amount]) => ({ category, amount }));
  }, [categories.data, reportTx]);
  const weightTrend = [...reportWeights].sort((a, b) => String(a.recorded_on).localeCompare(String(b.recorded_on)));
  const workoutCount = reportWorkouts.length;
  const workoutMonthly = new Map<string, { month: string; sessions: number; minutes: number; calories: number }>();
  for (const workout of reportWorkouts) {
    const month = String(workout.started_at).slice(0, 7);
    const point = workoutMonthly.get(month) ?? { month, sessions: 0, minutes: 0, calories: 0 };
    point.sessions += 1;
    point.minutes += Number(workout.duration_minutes ?? 0);
    point.calories += Number(workout.calories_burned ?? 0);
    workoutMonthly.set(month, point);
  }
  const nutritionByDay = new Map<string, { day: string; calories: number }>();
  for (const item of reportNutrition) {
    const day = String(item.consumed_at).slice(0, 10);
    const point = nutritionByDay.get(day) ?? { day, calories: 0 };
    point.calories += Number(item.calories ?? 0);
    nutritionByDay.set(day, point);
  }
  const timeByMonth = new Map<string, number>();
  for (const entry of reportTimeEntries) {
    if (!entry.ended_at) continue;
    const minutes = Math.max(0, (new Date(String(entry.ended_at)).getTime() - new Date(String(entry.started_at)).getTime()) / 60_000);
    const month = String(entry.started_at).slice(0, 7);
    timeByMonth.set(month, (timeByMonth.get(month) ?? 0) + minutes);
  }
  const productiveDays = new Map<string, number>();
  for (const task of reportTasks) {
    if (task.status !== "done" || typeof task.completed_at !== "string") continue;
    const day = new Date(task.completed_at).toLocaleDateString(undefined, { weekday: "short" });
    productiveDays.set(day, (productiveDays.get(day) ?? 0) + 1);
  }
  const lifeBalance = ["Personal", "Professional", "Fitness", "Finance"].map((area) => {
    const areaGoals = (goals.data ?? []).filter((goal) => goal.area === area && Number(goal.target_value) > 0);
    return { area, progress: areaGoals.length ? Math.round(areaGoals.reduce((sum, goal) => sum + Math.min(Number(goal.current_value ?? 0) / Number(goal.target_value) * 100, 100), 0) / areaGoals.length) : null };
  }).filter((item): item is { area: string; progress: number } => item.progress !== null);
  const budgetUsage = (budgets.data ?? []).map((budget) => {
    const currentPeriodStart = new Date();
    currentPeriodStart.setHours(0, 0, 0, 0);
    if (budget.period === "weekly") currentPeriodStart.setDate(currentPeriodStart.getDate() - 6);
    if (budget.period === "monthly") currentPeriodStart.setDate(1);
    if (budget.period === "yearly") currentPeriodStart.setMonth(0, 1);
    const periodStart = [String(budget.starts_on), localDateKey(currentPeriodStart)].sort().at(-1)!;
    const matching = (tx.data ?? []).filter((transaction) => transaction.type === "expense"
      && String(transaction.transaction_date) >= periodStart
      && String(transaction.transaction_date) <= today()
      && (!budget.category_id || transaction.category_id === budget.category_id));
    const spent = matching.reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0);
    return { name: String(budget.name), amount: Number(budget.amount), spent, percent: Number(budget.amount) ? Math.round(spent / Number(budget.amount) * 100) : 0 };
  });
  const monthlySavings = new Map<string, number>();
  for (const transaction of tx.data ?? []) {
    if (!transaction.account_id || String(transaction.transaction_date) > end) continue;
    const month = String(transaction.transaction_date).slice(0, 7);
    const accountAmount = Number(transaction.account_paid_amount ?? transaction.amount);
    monthlySavings.set(month, (monthlySavings.get(month) ?? 0) + (transaction.type === "income" ? accountAmount : -accountAmount));
  }
  let runningBalance = (accounts.data ?? []).reduce((sum, account) => sum + (account.type === "credit" ? -1 : 1) * Number(account.opening_balance ?? 0), 0);
  const netWorth = (accounts.data ?? []).length ? [...monthlySavings].sort(([a], [b]) => a.localeCompare(b)).flatMap(([month, net]) => {
    runningBalance += net;
    return month >= start.slice(0, 7) && month <= end.slice(0, 7) ? [{ month, balance: runningBalance }] : [];
  }) : [];
  return <div className="page"><div className="title"><div><p className="eyebrow">YOUR DATA, MADE USEFUL</p><h1>Analytics & reports</h1><p>All summaries and charts are derived from records in your Supabase account.</p></div></div>
    {dataError && <ErrorState error={dataError.error} />}
    <div className="report-filters"><label>Range<select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option><option value="year">This year</option><option value="custom">Custom</option></select></label>
      {period === "custom" && <><label>Start date<input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label><label>End date<input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label></>}</div>
    {dataQueries.some((query) => query.isLoading) ? <LoadingState /> : <>
      <div className="stats"><Stat label="Tasks completed" value={completed} detail={`${totalTasks ? Math.round(completed / totalTasks * 100) : 0}% of recorded tasks`} icon={<Check />} onClick={() => navigate("/module/tasks")} />
        <Stat label="Transactions" value={reportTx.length} detail="Income and expenses recorded in range" icon={<Wallet />} onClick={() => navigate("/module/transactions")} />
        <Stat label="Workout sessions" value={workoutCount} detail="Sessions logged" icon={<Dumbbell />} onClick={() => navigate("/module/workout_sessions")} />
        <Stat label="Weight records" value={weightTrend.length} detail="Measurements recorded" icon={<Activity />} onClick={() => navigate("/module/weight_entries")} /></div>
      <div className="dashboard-grid">
        <section className="panel"><PanelHeading title="Tasks by area" detail="Completed and open tasks from your records" />
          {taskByArea.length ? <div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={taskByArea}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="area" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Bar dataKey="completed" fill="#39ad84" /><Bar dataKey="open" fill="#6888ee" /></BarChart></ResponsiveContainer></div> : <ChartEmpty text="Create tasks in any area to start this report." />}</section>
        <section className="panel"><PanelHeading title="Most productive days" detail="Completed tasks by weekday from recorded completion times" />
          {productiveDays.size ? <div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={[...productiveDays].map(([day, count]) => ({ day, completed: count }))}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="day" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="completed" name="Tasks completed" fill="#6888ee" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div> : <ChartEmpty text="Complete tasks to compare actual productivity by weekday." />}</section>
        <section className="panel"><PanelHeading title="Time tracked" detail="Duration calculated from entries with both start and end times" />
          {timeByMonth.size ? <div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={[...timeByMonth].sort(([a], [b]) => a.localeCompare(b)).map(([month, minutes]) => ({ month, hours: Math.round(minutes / 60 * 10) / 10 }))}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Area dataKey="hours" name="Hours" stroke="#6888ee" fill="#6888ee33" /></AreaChart></ResponsiveContainer></div> : <ChartEmpty text="Add time entries with start and end times to see actual time spent." />}</section>
        <section className="panel"><PanelHeading title="Income, expenses, and monthly net" detail="Recorded financial activity by month" /><FinanceChart rows={reportTx} currencyCode={currencyCode} loading={false} /></section>
        <section className="panel"><PanelHeading title="Spending by category" detail="Expenses grouped by saved category" />
          {categorySpending.length ? <div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={categorySpending}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="category" tickLine={false} axisLine={false} /><YAxis /><Tooltip formatter={(value) => currency(Number(value), currencyCode)} /><Bar dataKey="amount" name="Spent" fill="#e78b6e" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div> : <ChartEmpty text="Add expense transactions to see category spending. No sample values are used." />}</section>
        <section className="panel"><PanelHeading title="Weight history" detail="Measurements ordered by date" />
          {weightTrend.length ? <div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={weightTrend.map((row) => ({ date: String(row.recorded_on), weight: Number(row.weight_kg) }))}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="date" tickLine={false} axisLine={false} /><YAxis domain={["auto", "auto"]} /><Tooltip /><Area dataKey="weight" name="Weight (kg)" stroke="#6888ee" fill="#6888ee33" /></AreaChart></ResponsiveContainer></div> : <ChartEmpty text="Record your weight to see your actual fitness trend." />}</section>
        <section className="panel"><PanelHeading title="Fitness sessions" detail="Workout time and calories by month" />
          {workoutMonthly.size ? <div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={[...workoutMonthly.values()].sort((a, b) => a.month.localeCompare(b.month))}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Legend /><Bar dataKey="minutes" name="Minutes" fill="#6888ee" /><Bar dataKey="calories" name="Calories burned" fill="#e78b6e" /></BarChart></ResponsiveContainer></div> : <ChartEmpty text="Log workout sessions with duration or calories to see fitness analytics." />}</section>
        <section className="panel"><PanelHeading title="Nutrition trend" detail="Recorded calories by day" />
          {nutritionByDay.size ? <div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={[...nutritionByDay.values()].sort((a, b) => a.day.localeCompare(b.day))}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="day" /><YAxis /><Tooltip /><Area dataKey="calories" name="Calories" stroke="#37ad83" fill="#37ad8333" /></AreaChart></ResponsiveContainer></div> : <ChartEmpty text="Record nutrition entries with calorie values to see this trend." />}</section>
        <section className="panel"><PanelHeading title="Life balance" detail="Average goal progress by area, using goals with saved targets" />
          {lifeBalance.length ? <div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={lifeBalance}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="area" /><YAxis domain={[0, 100]} /><Tooltip formatter={(value) => `${Number(value)}%`} /><Bar dataKey="progress" name="Goal progress (%)" fill="#6888ee" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div> : <ChartEmpty text="Add goals with a target and current progress to see life balance." />}</section>
        <section className="panel"><PanelHeading title="Budget utilization" detail="Current-period spending compared with saved budget limits" />
          {budgetUsage.length ? <div className="budget-list">{budgetUsage.map((budget) => <div className="budget-row" key={budget.name}><div><b>{budget.name}</b><small>{currency(budget.spent, currencyCode)} / {currency(budget.amount, currencyCode)} · {budget.percent}%</small></div><progress max="100" value={Math.min(budget.percent, 100)} aria-label={`${budget.name} utilization ${budget.percent}%`} /></div>)}</div> : <ChartEmpty text="Create a budget to track utilization against recorded expenses." />}</section>
        <section className="panel"><PanelHeading title="Net worth trend" detail="Opening balances plus recorded account-linked income and expenses" />
          {netWorth.length ? <div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={netWorth}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="month" /><YAxis /><Tooltip formatter={(value) => currency(Number(value), currencyCode)} /><Area dataKey="balance" name="Estimated tracked net worth" stroke="#37ad83" fill="#37ad8333" /></AreaChart></ResponsiveContainer></div> : <ChartEmpty text="Add accounts and account-linked transactions to track a real recorded net-worth trend." />}</section>
      </div>
    </>}
  </div>;
}

type RecordsPageProps = { userId: string; online: boolean; onToast: (text: string, error?: boolean) => void; openRequest: number; onQuickAddConsumed: () => void };

function TasksPage(props: RecordsPageProps) {
  return <RecordsPage {...props} resource={resourceFor("tasks")!} />;
}

function HabitsPage(props: RecordsPageProps) {
  return <RecordsPage {...props} resource={resourceFor("habits")!} />;
}

function TaskInsights({ rows }: { rows: Row[] }) {
  const openTasks = rows.filter((row) => row.status !== "done" && row.status !== "cancelled");
  const overdue = openTasks.filter((row) => typeof row.due_date === "string" && String(row.due_date).slice(0, 10) < today());
  const priorityData = taskPriorities.map((priority) => ({
    priority,
    count: rows.filter((row) => String(row.priority ?? "medium") === priority).length,
  }));
  return <div className="task-insights-grid">
    <section className="panel"><PanelHeading title="Priority overview" detail="Your tasks by TickTick-style priority" />
      <div className="task-summary"><div><b>{openTasks.length}</b><small>Open</small></div><div><b>{rows.filter((row) => row.priority === "high" && row.status !== "done" && row.status !== "cancelled").length}</b><small>High priority</small></div><div><b>{overdue.length}</b><small>Overdue</small></div></div>
      {rows.length ? <div className="chart priority-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={priorityData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="priority" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} /><Tooltip /><Bar dataKey="count" name="Tasks" radius={[4, 4, 0, 0]}>{priorityData.map((item) => <Cell key={item.priority} fill={`var(--priority-${item.priority})`} />)}</Bar></BarChart></ResponsiveContainer></div> : <ChartEmpty text="Create a task to start tracking your priority mix." />}
    </section>
  </div>;
}

function NutritionInsights({ rows }: { rows: Row[] }) {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(today);
  const anchor = new Date(`${month}-01T12:00:00`);
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - ((gridStart.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => new Date(2024, 0, index + 1).toLocaleDateString(undefined, { weekday: "short" }));
  const byDate = new Map<string, { entries: Row[]; calories: number; protein: number; carbohydrates: number; fat: number }>();
  for (const row of rows) {
    const date = recordDateKey(row.consumed_at);
    if (!date) continue;
    const daily = byDate.get(date) ?? { entries: [], calories: 0, protein: 0, carbohydrates: 0, fat: 0 };
    daily.entries.push(row);
    daily.calories += Number(row.calories ?? 0);
    daily.protein += Number(row.protein_g ?? 0);
    daily.carbohydrates += Number(row.carbohydrates_g ?? 0);
    daily.fat += Number(row.fat_g ?? 0);
    byDate.set(date, daily);
  }
  const chartData = Array.from({ length: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate() }, (_, index) => {
    const date = localDateKey(new Date(anchor.getFullYear(), anchor.getMonth(), index + 1, 12));
    const daily = byDate.get(date);
    return { day: String(index + 1), calories: daily?.calories ?? 0, protein: daily?.protein ?? 0, carbohydrates: daily?.carbohydrates ?? 0, fat: daily?.fat ?? 0 };
  });
  const selected = byDate.get(selectedDate);
  const shiftMonth = (amount: number) => {
    const nextMonth = localDateKey(addMonths(anchor, amount)).slice(0, 7);
    setMonth(nextMonth);
    setSelectedDate(`${nextMonth}-01`);
  };
  return <div className="nutrition-insights-grid">
    <section className="panel nutrition-trends">
      <PanelHeading title="Daily nutrition" detail="Calories and macronutrients · selected month" />
      {rows.length ? <>
        <div className="nutrition-chart-grid">
          <div><h3>Calories</h3><div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="day" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip labelFormatter={(day) => `${month}-${String(day).padStart(2, "0")}`} /><Area type="monotone" dataKey="calories" name="Calories" stroke="#e78b6e" fill="#e78b6e33" /></AreaChart></ResponsiveContainer></div></div>
          <div><h3>Macros (g)</h3><div className="chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="day" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip labelFormatter={(day) => `${month}-${String(day).padStart(2, "0")}`} /><Legend /><Line type="monotone" dataKey="protein" name="Protein" stroke="#6888ee" dot={false} /><Line type="monotone" dataKey="carbohydrates" name="Carbohydrates" stroke="#37ad83" dot={false} /><Line type="monotone" dataKey="fat" name="Fat" stroke="#d18b53" dot={false} /></LineChart></ResponsiveContainer></div></div>
        </div>
      </> : <ChartEmpty text="Log a meal to see your daily calorie and macro trends." />}
    </section>
    <section className="panel nutrition-calendar">
      <div className="habit-calendar-heading">
        <div><h2>Nutrition calendar</h2><p>Select a date to review meals and totals.</p></div>
        <div className="habit-calendar-controls">
          <button className="icon" aria-label="Previous month" onClick={() => shiftMonth(-1)}><ChevronLeft size={14} /></button>
          <b>{anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</b>
          <button className="icon" aria-label="Next month" onClick={() => shiftMonth(1)}><ChevronRight size={14} /></button>
        </div>
      </div>
      <div className="habit-calendar-grid" role="group" aria-label="Nutrition calendar">
        {weekdayLabels.map((day) => <span className="calendar-weekday" key={day}>{day}</span>)}
        {days.map((date) => {
          const dateKey = localDateKey(date);
          const daily = byDate.get(dateKey);
          return <button key={dateKey}
            className={`habit-calendar-day nutrition-calendar-day ${date.getMonth() !== anchor.getMonth() ? "outside-month" : ""} ${dateKey === today() ? "today-cell" : ""} ${dateKey === selectedDate ? "selected" : ""}`}
            onClick={() => { setSelectedDate(dateKey); if (date.getMonth() !== anchor.getMonth()) setMonth(dateKey.slice(0, 7)); }}
            aria-pressed={dateKey === selectedDate}
            aria-label={`${date.toLocaleDateString()}, ${daily?.entries.length ?? 0} meals, ${daily?.calories ?? 0} calories`}>
            <span>{date.getDate()}</span>{daily && <small>{daily.calories} kcal</small>}
          </button>;
        })}
      </div>
      <div className="nutrition-day-summary"><b>{configuredDate(selectedDate)}</b><span>{selected?.entries.length ?? 0} meals · {selected?.calories ?? 0} kcal</span></div>
      {selected?.entries.length ? <div className="nutrition-meal-list">{selected.entries.slice().sort((a, b) => String(a.consumed_at).localeCompare(String(b.consumed_at))).map((entry) => <div className="nutrition-meal-row" key={entry.id}>
        <div><b>{String(entry.description)}</b><small>{String(entry.meal_type ?? "meal")} · {configuredDate(String(entry.consumed_at))}</small></div>
        <span>{Number(entry.calories ?? 0)} kcal</span>
      </div>)}</div> : <p className="nutrition-empty-day">No meals recorded for this day.</p>}
    </section>
  </div>;
}

function RecordInsights({ resource, rows, relatedRows = [], expanded = false }: { resource: Resource; rows: Row[]; relatedRows?: Row[]; expanded?: boolean }) {
  type Point = { label: string; value: number; compare?: number };
  type ChartType = "bar" | "line" | "pie" | "metrics" | "progress" | "category-bars";
  const colors = ["#6888ee", "#37ad83", "#e78b6e", "#d18b53", "#8e62b5", "#48a9b5"];
  const number = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  const isCategoryPage = resource.key === "transaction_categories";
  const [isExpanded, setIsExpanded] = useState(false);
  const [chartFrom, setChartFrom] = useState(() => `${today().slice(0, 7)}-01`);
  const [chartTo, setChartTo] = useState(today);
  const chartDateFields: Record<string, string> = {
    habit_completions: "completed_on", journal_entries: "entry_date", mood_entries: "recorded_at",
    project_milestones: "due_date", weight_entries: "recorded_on", workout_sessions: "started_at",
    nutrition_entries: "consumed_at", water_entries: "consumed_at", transactions: "transaction_date",
    loans: "loan_date", savings_contributions: "contributed_on", calendar_events: "starts_at",
  };
  const chartDateField = chartDateFields[resource.key];
  const scopedRows = chartDateField
    ? rows.filter((row) => {
      const date = recordDateKey(row[chartDateField]);
      return date ? date >= chartFrom && date <= chartTo : false;
    })
    : rows;
  const [categoryMonth, setCategoryMonth] = useState(() => today().slice(0, 7));
  const [categoryFrom, setCategoryFrom] = useState(() => `${today().slice(0, 7)}-01`);
  const [categoryTo, setCategoryTo] = useState(today);
  const selectCategoryMonth = (month: string) => {
    setCategoryMonth(month);
    const start = new Date(`${month}-01T12:00:00`);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    setCategoryFrom(`${month}-01`);
    setCategoryTo(month === today().slice(0, 7) ? today() : localDateKey(end));
  };
  const groupBy = (field: string, valueForRow: (row: Row) => number = () => 1): Point[] => {
    const groups = new Map<string, number>();
    for (const row of scopedRows) {
      const label = String(row[field] ?? "Unspecified").replaceAll("_", " ");
      const value = valueForRow(row);
      if (Number.isFinite(value)) groups.set(label, (groups.get(label) ?? 0) + value);
    }
    return [...groups].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  };
  const byMonth = (field: string, valueForRow: (row: Row) => number = () => 1): Point[] => {
    const groups = new Map<string, number>();
    for (const row of scopedRows) {
      const date = recordDateKey(row[field]);
      if (!date) continue;
      const month = date.slice(0, 7);
      const value = valueForRow(row);
      if (Number.isFinite(value)) groups.set(month, (groups.get(month) ?? 0) + value);
    }
    return [...groups].sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({ label: format(new Date(`${month}-01T12:00:00`), "MMM yy"), value }));
  };
  let title = `${resource.label} overview`;
  let detail = "A breakdown of your saved records";
  let chartType: ChartType = "bar";
  let points: Point[] = [];
  let valueLabel = "Records";
  let metricLabel = "";
  let metricValue: number | undefined;
  let profileMetrics: { label: string; value: string }[] = [];
  switch (resource.key) {
    case "goals":
      title = "Goals by status"; detail = "Your goals grouped by current status"; chartType = "pie"; points = groupBy("status"); break;
    case "habit_completions":
      title = "Habit check-ins"; detail = "Completions recorded by month"; chartType = "line"; points = byMonth("completed_on"); break;
    case "journal_entries":
      title = "Journal entries"; detail = "Entries recorded by month"; chartType = "line"; points = byMonth("entry_date"); break;
    case "mood_entries":
      title = "Mood check-ins"; detail = "Check-in frequency by mood"; chartType = "pie"; points = groupBy("mood"); break;
    case "projects":
      title = "Projects by status"; detail = "Portfolio distribution by current status"; chartType = "pie"; points = groupBy("status"); break;
    case "project_milestones":
      title = "Milestone progress"; detail = "Completed compared with outstanding milestones"; chartType = "pie";
      points = [{ label: "Completed", value: scopedRows.filter((row) => row.completed_at).length }, { label: "Open", value: scopedRows.filter((row) => !row.completed_at).length }].filter((point) => point.value > 0); break;
    case "skills":
      title = "Skill proficiency"; detail = "Your highest recorded proficiency levels"; valueLabel = "Proficiency (%)"; points = groupBy("name", (row) => Number(row.proficiency ?? 0)); break;
    case "job_applications":
      title = "Career pipeline"; detail = "Applications grouped by current stage"; chartType = "pie"; points = groupBy("status"); break;
    case "time_entries":
      title = "Time by activity"; detail = "Hours calculated from completed time entries"; valueLabel = "Hours";
      points = groupBy("title", (row) => row.ended_at && row.started_at
        ? Math.max(0, (new Date(String(row.ended_at)).getTime() - new Date(String(row.started_at)).getTime()) / 3_600_000) : 0); break;
    case "fitness_profiles": {
      title = "Your fitness targets"; detail = "Personal measures and daily targets"; chartType = "metrics";
      const profile = scopedRows[0];
      profileMetrics = [
        { label: "Height", value: profile?.height_cm ? `${number(Number(profile.height_cm))} cm` : "Not set" },
        { label: "Target weight", value: profile?.target_weight_kg ? `${number(Number(profile.target_weight_kg))} kg` : "Not set" },
        { label: "Daily calories", value: profile?.daily_calorie_target ? `${number(Number(profile.daily_calorie_target))} kcal` : "Not set" },
        { label: "Daily water", value: profile?.daily_water_target_ml ? `${number(Number(profile.daily_water_target_ml))} ml` : "Not set" },
      ];
      break;
    }
    case "weight_entries":
      title = "Weight history"; detail = "Recorded measurements over time"; valueLabel = "Weight (kg)"; chartType = "line";
      points = [...scopedRows].sort((a, b) => String(a.recorded_on).localeCompare(String(b.recorded_on)))
        .map((row) => ({ label: configuredDate(String(row.recorded_on)), value: Number(row.weight_kg) }));
      metricLabel = "Latest weight";
      metricValue = points.at(-1)?.value;
      break;
    case "exercises":
      title = "Exercises by muscle group"; detail = "Your exercise library grouped by muscle group"; chartType = "pie"; points = groupBy("muscle_group"); break;
    case "workout_routines":
      title = "Routine library"; detail = "Your saved training plans"; chartType = "metrics";
      profileMetrics = scopedRows.slice(0, 4).map((row, index) => ({ label: `Routine ${index + 1}`, value: String(row.name ?? "Untitled") }));
      break;
    case "workout_routine_exercises":
      title = "Routine volume"; detail = "Sets assigned by exercise position"; valueLabel = "Sets";
      points = [...scopedRows].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0)).slice(0, 8)
        .map((row, index) => ({ label: `Exercise ${index + 1}`, value: Number(row.sets ?? 0) })); break;
    case "workout_sessions":
      title = "Training time"; detail = "Workout minutes by month"; valueLabel = "Minutes"; chartType = "line";
      points = byMonth("started_at", (row) => Number(row.duration_minutes ?? 0)); break;
    case "workout_session_exercises":
      title = "Exercises trained"; detail = "Logged sets by exercise"; valueLabel = "Sets"; points = groupBy("exercise_name", (row) => Number(row.sets ?? 0)); break;
    case "nutrition_entries":
      title = "Nutrition trend"; detail = "Calories recorded by month"; valueLabel = "Calories"; chartType = "line";
      points = byMonth("consumed_at", (row) => Number(row.calories ?? 0)); break;
    case "water_entries":
      title = "Hydration logged"; detail = "Water intake by month"; valueLabel = "Milliliters"; chartType = "line";
      points = byMonth("consumed_at", (row) => Number(row.amount_ml ?? 0)); break;
    case "financial_accounts":
      title = "Accounts by type"; detail = "Account distribution without combining different currencies"; chartType = "pie"; points = groupBy("type"); break;
    case "transaction_categories":
      title = "Transactions by category"; detail = "Income and expense totals for the selected dates"; chartType = "category-bars"; break;
    case "transactions":
      title = "Cash flow mix"; detail = "Transaction amounts split by income and expense"; valueLabel = "Amount"; chartType = "pie"; points = groupBy("type", (row) => Number(row.amount ?? 0)); break;
    case "loans":
      title = "Borrowed vs. lent"; detail = "Outstanding balances by direction"; valueLabel = "Balance"; chartType = "pie";
      points = groupBy("direction", (row) => row.is_settled ? 0 : Number(row.amount ?? 0)); break;
    case "budgets":
      title = "Budget usage"; detail = "Spent against each budget limit"; valueLabel = "Spent";
      points = budgetTotals(rows, relatedRows, today()).usage.map((budget) => ({ label: budget.name, value: budget.spent, compare: budget.amount })); chartType = "progress"; break;
    case "savings_goals":
      title = "Savings goal progress"; detail = "Current amount compared with each target"; valueLabel = "Saved";
      points = scopedRows.slice(0, 8).map((row) => ({ label: String(row.name ?? "Goal"), value: Number(row.current_amount ?? 0), compare: Number(row.target_amount ?? 0) })); chartType = "progress"; break;
    case "savings_contributions":
      title = "Savings contributions"; detail = "Contributions by month"; valueLabel = "Amount"; chartType = "line";
      points = byMonth("contributed_on", (row) => Number(row.amount ?? 0)); break;
    case "recurring_transactions":
      title = "Recurring cash flow"; detail = "Scheduled amounts by transaction type"; valueLabel = "Amount"; chartType = "pie"; points = groupBy("type", (row) => Number(row.amount ?? 0)); break;
    case "calendar_events":
      title = "Calendar activity"; detail = "Events scheduled by month"; chartType = "line"; points = byMonth("starts_at"); break;
    case "notifications":
      title = "Notification status"; detail = "Read and unread notifications"; chartType = "pie";
      points = [{ label: "Read", value: scopedRows.filter((row) => row.read_at).length }, { label: "Unread", value: scopedRows.filter((row) => !row.read_at).length }].filter((point) => point.value > 0); break;
    default: {
      const categoricalField = resource.fields.find((field) => field.options?.length)?.name;
      const field = categoricalField ?? resource.display;
      title = categoricalField ? `${resource.label} by ${field.replaceAll("_", " ")}` : `${resource.label} overview`;
      detail = categoricalField ? `Records grouped by ${field.replaceAll("_", " ")}` : `Saved ${resource.label.toLowerCase()} by ${resource.display.replaceAll("_", " ")}`;
      chartType = categoricalField ? "pie" : "bar";
      points = groupBy(field);
    }
  }
  const categoryNames = new Map(rows.map((row) => [String(row.id), String(row.name ?? "Uncategorized")]));
  const categoryTypes = new Map(rows.map((row) => [String(row.id), String(row.type ?? "")]));
  const categoryTotals = (type: "expense" | "income"): Point[] => {
    const totals = new Map<string, number>();
    for (const transaction of relatedRows) {
      const date = String(transaction.transaction_date ?? "");
      if (!date || date < categoryFrom || date > categoryTo || transaction.type !== type) continue;
      const categoryId = String(transaction.category_id ?? "");
      const label = categoryNames.get(categoryId) ?? "Uncategorized";
      if (categoryId && categoryTypes.get(categoryId) && categoryTypes.get(categoryId) !== type) continue;
      totals.set(label, (totals.get(label) ?? 0) + Number(transaction.amount ?? 0));
    }
    return [...totals].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };
  const expenseCategoryPoints = isCategoryPage ? categoryTotals("expense") : [];
  const incomeCategoryPoints = isCategoryPage ? categoryTotals("income") : [];
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const leading = [...points].sort((a, b) => b.value - a.value)[0];
  const chartContentRows = isCategoryPage ? rows : scopedRows;
  return <><div className={`task-insights-grid ${expanded ? "chart-expanded-content" : ""}`}>
    <section className="panel"><div className="panel-heading"><div><h2>{title}</h2><p>{detail}</p></div>{!expanded && <button className="icon chart-expand-button" aria-label={`Open ${title} in full view`} title="Open full chart" onClick={() => setIsExpanded(true)}><Maximize2 size={13} /></button>}</div>
      {chartDateField && <div className="category-chart-filters chart-scope-filter">
        {!expanded ? <label className="filter-input date-filter"><CalendarDays size={12} /><span>Month</span><input type="month" value={chartFrom.slice(0, 7)} onChange={(event) => {
          const month = event.target.value;
          const end = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0);
          setChartFrom(`${month}-01`);
          setChartTo(month === today().slice(0, 7) ? today() : localDateKey(end));
        }} aria-label="Select chart month" /></label> : <><label className="filter-input date-filter"><CalendarDays size={12} /><span>From</span><input type="date" value={chartFrom} onChange={(event) => setChartFrom(event.target.value)} aria-label="Chart from date" /></label><label className="filter-input date-filter"><CalendarDays size={12} /><span>To</span><input type="date" value={chartTo} onChange={(event) => setChartTo(event.target.value)} aria-label="Chart to date" /></label></>}
      </div>}
      {isCategoryPage && <div className="category-chart-filters">
        <label className="filter-input date-filter"><CalendarDays size={12} /><span>Month</span><input type="month" value={categoryMonth} onChange={(event) => selectCategoryMonth(event.target.value)} aria-label="Select category chart month" /></label>
        {expanded && <><label className="filter-input date-filter"><CalendarDays size={12} /><span>From</span><input type="date" value={categoryFrom} onChange={(event) => setCategoryFrom(event.target.value)} aria-label="Category chart from date" /></label>
        <label className="filter-input date-filter"><CalendarDays size={12} /><span>To</span><input type="date" value={categoryTo} onChange={(event) => setCategoryTo(event.target.value)} aria-label="Category chart to date" /></label></>}
      </div>}
      {chartContentRows.length ? <>
        {chartType === "category-bars" ? <div className="category-chart-grid">
          <CategoryBarChart title="Expenses by category" points={expenseCategoryPoints} color="#e78b6e" emptyText="No expenses in the selected date range." number={number} />
          <CategoryBarChart title="Income by category" points={incomeCategoryPoints} color="#37ad83" emptyText="No income in the selected date range." number={number} />
        </div> : <>
        <div className="record-insight-metrics">
          <div><small>Total records</small><b>{chartContentRows.length.toLocaleString()}</b></div>
          {resource.key === "transactions" ? <><div><small>Income</small><b>{number(scopedRows.filter((row) => row.type === "income").reduce((sum, row) => sum + Number(row.amount ?? 0), 0))}</b></div><div><small>Expense</small><b>{number(scopedRows.filter((row) => row.type === "expense").reduce((sum, row) => sum + Number(row.amount ?? 0), 0))}</b></div></> : chartType !== "metrics" && <div><small>{metricLabel || valueLabel}</small><b>{number(metricValue ?? total)}</b></div>}
          {leading && <div><small>Leading {chartType === "pie" ? "group" : "item"}</small><b>{leading.label} · {number(leading.value)}</b></div>}
        </div>
        {chartType === "metrics" ? <div className="record-insight-metrics record-profile-metrics">{profileMetrics.map((metric) => <div key={metric.label}><small>{metric.label}</small><b>{metric.value}</b></div>)}</div>
          : !points.length ? <ChartEmpty text={`Add relevant ${resource.label.toLowerCase()} data to see this chart.`} />
            : chartType === "progress" ? <div className="record-progress-list">{points.map((point) => {
              const target = Math.max(0, point.compare ?? 0);
              const percent = target ? Math.min(100, Math.round(point.value / target * 100)) : 0;
              return <div className="record-progress-row" key={point.label}>
                <div className="record-progress-heading"><b>{point.label}</b><span>{number(point.value)} of {number(target)}</span></div>
                <progress max="100" value={percent} aria-label={`${point.label}: ${number(point.value)} of ${number(target)}`} />
                <small>{percent}% complete</small>
              </div>;
            })}</div>
            : <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === "pie" ? <PieChart><Pie data={points} dataKey="value" nameKey="label" innerRadius="48%" outerRadius="76%" paddingAngle={3}>{points.map((point, index) => <Cell key={point.label} fill={colors[index % colors.length]} />)}</Pie><Tooltip formatter={(value) => number(Number(value))} /><Legend /></PieChart>
                  : chartType === "line" ? <LineChart data={points}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><Tooltip formatter={(value) => `${number(Number(value))} ${valueLabel.toLowerCase()}`} /><Line type="monotone" dataKey="value" name={valueLabel} stroke="#6888ee" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} /></LineChart>
                    : <BarChart data={points}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><Tooltip formatter={(value) => `${number(Number(value))} ${valueLabel.toLowerCase()}`} /><Legend />{points.some((point) => point.compare !== undefined) && <Bar dataKey="compare" name="Target" fill="#d9e0f8" radius={[4, 4, 0, 0]} />}<Bar dataKey="value" name={valueLabel} fill="var(--accent)" radius={[4, 4, 0, 0]} /></BarChart>}
              </ResponsiveContainer>
            </div>}
        </>} </> : <ChartEmpty text={`Create a ${resource.label.toLowerCase()} record to see relevant metrics here.`} />}
    </section>
  </div>{isExpanded && !expanded && <AppPortal><div className="overlay chart-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsExpanded(false); }}><section className="modal chart-modal" role="dialog" aria-modal="true" aria-label={`${title} full view`}><div className="modalhead"><div><p className="eyebrow">FULL CHART VIEW</p><h2>{title}</h2></div><button className="icon" aria-label="Close chart" onClick={() => setIsExpanded(false)}><X size={15} /></button></div><RecordInsights resource={resource} rows={rows} relatedRows={relatedRows} expanded /></section></div></AppPortal>}</>;
}

function CategoryBarChart({ title, points, color, emptyText, number }: { title: string; points: { label: string; value: number }[]; color: string; emptyText: string; number: (value: number) => string }) {
  return <section className="category-bar-chart"><h3>{title}</h3>
    {!points.length ? <ChartEmpty text={emptyText} /> : <div className="chart category-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={points} layout="vertical" margin={{ left: 18, right: 12 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--line)" /><XAxis type="number" tickLine={false} axisLine={false} /><YAxis type="category" dataKey="label" width={84} tickLine={false} axisLine={false} /><Tooltip formatter={(value) => number(Number(value))} /><Bar dataKey="value" name={title.replace(" by category", "")} fill={color} radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div>}
  </section>;
}

function HabitInsights({ habits, completions, loading, busy, onToggleCheckin, selectedHabitId, onSelectHabit }: {
  habits: Row[];
  completions: Row[];
  loading: boolean;
  busy: boolean;
  onToggleCheckin: (habitId: string, date: string, checked: boolean) => void;
  selectedHabitId?: string;
  onSelectHabit?: (habitId: string | undefined) => void;
}) {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(today);
  const anchor = new Date(`${month}-01T12:00:00`);
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - ((gridStart.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const activeHabits = habits.filter((habit) => habit.is_active && (!selectedHabitId || habit.id === selectedHabitId));
  const completionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const completion of completions.filter((item) => !selectedHabitId || item.habit_id === selectedHabitId)) {
      const date = String(completion.completed_on ?? "");
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
    return counts;
  }, [completions, selectedHabitId]);
  const selectedCompletions = completions.filter((completion) => completion.completed_on === selectedDate && (!selectedHabitId || completion.habit_id === selectedHabitId));
  const shiftMonth = (amount: number) => {
    const next = new Date(anchor);
    next.setMonth(next.getMonth() + amount);
    const key = localDateKey(next).slice(0, 7);
    setMonth(key);
    setSelectedDate(`${key}-01`);
  };
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => new Date(2024, 0, 1 + index).toLocaleDateString(undefined, { weekday: "short" }));
  return <div className="habit-insights-grid">
    <section className="panel"><PanelHeading title="Habit activity" detail="Check-ins recorded each day · last 7 days" />
      <HabitTrendChart rows={completions} loading={loading} />
    </section>
    <section className="panel habit-checkin-calendar">
      <div className="habit-calendar-heading">
        <div><h2>{selectedHabitId ? `${String(activeHabits[0]?.name ?? "Habit")} calendar` : "Habit check-in calendar"}</h2><p>Select a day to review or record your habits.</p></div>
        <div className="habit-calendar-controls">
          {selectedHabitId && <button className="text-button" onClick={() => onSelectHabit?.(undefined)}>All habits</button>}
          <button className="icon" aria-label="Previous month" onClick={() => shiftMonth(-1)}><ChevronLeft size={14} /></button>
          <b>{anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</b>
          <button className="icon" aria-label="Next month" onClick={() => shiftMonth(1)}><ChevronRight size={14} /></button>
        </div>
      </div>
      <div className="habit-calendar-grid" role="group" aria-label="Habit check-in calendar">
        {weekdayLabels.map((day) => <span className="calendar-weekday" key={day}>{day}</span>)}
        {days.map((date) => {
          const dateKey = localDateKey(date);
          const count = completionCounts.get(dateKey) ?? 0;
          return <button key={dateKey}
            className={`habit-calendar-day ${date.getMonth() !== anchor.getMonth() ? "outside-month" : ""} ${dateKey === today() ? "today-cell" : ""} ${dateKey === selectedDate ? "selected" : ""}`}
            onClick={() => { setSelectedDate(dateKey); if (date.getMonth() !== anchor.getMonth()) setMonth(dateKey.slice(0, 7)); }}
            aria-pressed={dateKey === selectedDate}
            aria-label={`${date.toLocaleDateString()}, ${count} habit check-ins`}>
            <span>{date.getDate()}</span>{count > 0 && <small>{count} done</small>}
          </button>;
        })}
      </div>
      <div className="habit-calendar-day-heading"><b>{configuredDate(selectedDate)}</b><span>{selectedCompletions.length} of {activeHabits.length} checked in</span></div>
      {activeHabits.length ? <div className="habit-calendar-list">{activeHabits.map((habit) => {
        const checked = selectedCompletions.some((completion) => completion.habit_id === habit.id);
        const HabitIcon = habitIcons[String(habit.icon)] ?? Flame;
        return <div className="habit-calendar-row" key={habit.id}>
          <span className={`habit-icon habit-color-${String(habit.color ?? "violet")}`}><HabitIcon size={15} /></span>
          <span>{String(habit.name)}</span>
          <button className={`secondary check-in ${checked ? "checked-in" : ""}`} disabled={busy || selectedDate > today()} onClick={() => onToggleCheckin(String(habit.id), selectedDate, checked)}>
            {checked ? "Checked in" : "Check in"}
          </button>
        </div>;
      })}</div> : <EmptyState title="No active habits" detail="Add an active habit to use the check-in calendar." />}
    </section>
  </div>;
}

function RecordsPage({ resource, userId, online, onToast, openRequest, onQuickAddConsumed }: RecordsPageProps & { resource: Resource }) {
  const rows = useRows(resource.table, userId);
  const habitCompletions = useRows("habit_completions", userId, resource.key === "habits");
  const linkedAccounts = useRows("financial_accounts", userId, resource.key === "payment_cards");
  const accountTransactions = useRows("transactions", userId, resource.key === "financial_accounts");
  const settlementAccounts = useRows("financial_accounts", userId, resource.key === "loans");
  const savingsGoals = useRows("savings_goals", userId, resource.key === "savings_contributions" || resource.key === "savings_goals");
  const savingsContributions = useRows("savings_contributions", userId, resource.key === "savings_contributions" || resource.key === "savings_goals");
  const budgetTransactions = useRows("transactions", userId, resource.key === "budgets");
  const categoryTransactions = useRows("transactions", userId, resource.key === "transaction_categories");
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [settlementTarget, setSettlementTarget] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [viewingLoanGroup, setViewingLoanGroup] = useState<LoanGroup | null>(null);
  const linkedTransactions = useRows("transactions", userId, resource.key === "loans" && Boolean(viewingLoanGroup));
  const [filter, setFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [sortMode, setSortMode] = useState("recent");
  const [recordPage, setRecordPage] = useState(1);
  const [transactionPage, setTransactionPage] = useState(1);
  const [transactionMonth, setTransactionMonth] = useState(() => today().slice(0, 7));
  const [transactionFrom, setTransactionFrom] = useState(() => `${today().slice(0, 7)}-01`);
  const [transactionTo, setTransactionTo] = useState(today);
  const [selectedHabitId, setSelectedHabitId] = useState<string>();
  const [markingAll, setMarkingAll] = useState(false);
  useEffect(() => {
    if (openRequest > 0) {
      setEditing(null);
      setDialog(true);
      onQuickAddConsumed();
    }
  }, [onQuickAddConsumed, openRequest]);
  function selectTransactionMonth(month: string) {
    setTransactionMonth(month);
    const start = new Date(`${month}-01T12:00:00`);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    const endKey = localDateKey(end);
    setTransactionFrom(`${month}-01`);
    setTransactionTo(month === today().slice(0, 7) ? today() : endKey);
  }
  const save = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const payload = cleanFormValues(values, fieldsForRecord(resource, Boolean(editing)));
      if (resource.key === "tasks" && payload.status === "done") payload.completed_at = editing?.completed_at ?? new Date().toISOString();
      else if (resource.key === "tasks" && payload.status && payload.status !== "done") payload.completed_at = null;
      if (resource.key === "transactions" && !editing && payload.type === "expense") {
        const accountAmount = Number(values.account_paid_amount ?? 0);
        const borrowedAmount = Number(values.borrowed_amount ?? 0);
        const loanDirection = String(values.funding_source ?? "") === "lent" ? "lent" : "borrowed";
        const transactionId = crypto.randomUUID();
        const loanId = borrowedAmount > 0 ? crypto.randomUUID() : null;
        const transactionDate = String(payload.transaction_date);
        const personName = String(values.borrowed_from ?? "").trim();
        const expenseAmount = Number(payload.amount);
        const accountId = accountAmount > 0 ? String(payload.account_id ?? "") || null : null;
        const notes = payload.notes ?? null;
        const changes: OfflineRecordChange[] = [{
          kind: "upsert",
          table: "transactions",
          row: {
            id: transactionId, user_id: userId, table: "transactions", title: payload.title, amount: expenseAmount,
            type: "expense", transaction_date: transactionDate, account_id: accountId,
            account_paid_amount: accountAmount, category_id: payload.category_id ?? null, notes,
          } as Row & { table: string },
        }];
        const args: Record<string, unknown> = {
          p_user_id: userId,
          p_title: String(payload.title),
          p_amount: expenseAmount,
          p_transaction_date: transactionDate,
          p_account_id: accountId,
          p_account_amount: accountAmount,
          p_category_id: payload.category_id ?? null,
          p_notes: notes,
          p_borrowed_from: personName || null,
          p_borrowed_amount: borrowedAmount,
          p_loan_direction: loanDirection,
          p_transaction_id: transactionId,
          p_loan_id: loanId,
        };
        if (loanId) changes.push({
          kind: "upsert",
          table: "loans",
          row: {
            id: loanId, user_id: userId, table: "loans", person_name: personName, direction: loanDirection,
            amount: borrowedAmount, loan_date: transactionDate, due_date: null, is_settled: false,
            notes: [notes, `${loanDirection === "lent" ? "Lent" : "Borrowed"} for: ${String(payload.title)}`].filter(Boolean).join("\n"),
            transaction_id: transactionId,
          } as Row & { table: string },
        });
        await enqueueRpc(userId, "create_expense_with_funding_split", args, changes);
        return syncQueuedChanges(userId);
      }
      const isSingleton = resource.table === "fitness_profiles";
      const recordId = isSingleton ? userId : editing?.id ?? crypto.randomUUID();
      const result = await saveQueuedRow(userId, resource.table, {
        ...payload,
        ...(!isSingleton ? { id: recordId } : {}),
      }, { onConflict: isSingleton ? "user_id" : "id", cacheId: recordId });
      if (resource.key === "loans" && payload.is_settled && !editing?.is_settled) {
        const settlementAccountId = String(payload.settlement_account_id ?? "");
        if (!settlementAccountId) throw new Error("Choose the account used for settlement.");
        await saveQueuedRow(userId, "transactions", {
          id: crypto.randomUUID(),
          title: `${payload.direction === "lent" ? "Loan repayment received from" : "Loan repayment to"} ${String(payload.person_name)}`,
          amount: Number(payload.amount),
          type: payload.direction === "lent" ? "income" : "expense",
          transaction_date: String(payload.settled_at || today()),
          account_id: settlementAccountId,
          account_paid_amount: Number(payload.amount),
          notes: "Created when a borrowed or lent balance was settled.",
        });
      }
      if (resource.key === "savings_contributions" && payload.savings_goal_id) {
        const goalId = String(payload.savings_goal_id);
        const total = (savingsContributions.data ?? [])
          .filter((contribution) => contribution.id !== editing?.id && contribution.savings_goal_id === goalId)
          .reduce((sum, contribution) => sum + Number(contribution.amount ?? 0), 0) + Number(payload.amount ?? 0);
        const goal = (savingsGoals.data ?? []).find((item) => item.id === goalId);
        if (goal) await saveQueuedRow(userId, "savings_goals", { id: goalId, current_amount: total });
      }
      return result;
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["rows", userId, resource.table] });
      if (resource.key === "savings_contributions") await queryClient.invalidateQueries({ queryKey: ["rows", userId, "savings_goals"] });
      if (resource.key === "transactions" || resource.key === "nutrition_entries") await queryClient.invalidateQueries({ queryKey: ["rows", userId, "loans"] });
      if (resource.key === "loans") await queryClient.invalidateQueries({ queryKey: ["rows", userId, "transactions"] });
      setDialog(false); setEditing(null); setSettlementTarget(null); onToast(savedLocallyMessage(resource.label, result));
    },
    onError: (error) => onToast(`Could not save ${resource.label.toLowerCase()}: ${error.message}`, true),
  });
  const remove = useMutation({
    mutationFn: async (row: Row) => {
      const result = await deleteQueuedRow(userId, resource.table, row.id);
      if (resource.key === "savings_contributions" && row.savings_goal_id) {
        const goalId = String(row.savings_goal_id);
        const total = (savingsContributions.data ?? [])
          .filter((contribution) => contribution.id !== row.id && contribution.savings_goal_id === goalId)
          .reduce((sum, contribution) => sum + Number(contribution.amount ?? 0), 0);
        if ((savingsGoals.data ?? []).some((goal) => goal.id === goalId)) {
          await saveQueuedRow(userId, "savings_goals", { id: goalId, current_amount: total });
        }
      }
      return result;
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["rows", userId, resource.table] });
      if (resource.key === "savings_contributions") await queryClient.invalidateQueries({ queryKey: ["rows", userId, "savings_goals"] });
      if (resource.key === "habits") await queryClient.invalidateQueries({ queryKey: ["rows", userId, "habit_completions"] });
      setDeleting(null); setDialog(false); setEditing(null); onToast(savedLocallyMessage(`${resource.label} deleted`, result));
    },
    onError: (error) => onToast(`Could not delete record: ${error.message}`, true),
  });
  const changePriority = useMutation({
    mutationFn: async ({ row, priority }: { row: Row; priority: string }) => {
      return saveQueuedRow(userId, "tasks", { id: row.id, priority });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["rows", userId, "tasks"] });
      onToast(savedLocallyMessage("Task priority", result));
    },
    onError: (error) => onToast(`Could not update task priority: ${error.message}`, true),
  });
  const updateInlineField = useMutation({
    mutationFn: async ({ row, field, value }: { row: Row; field: Field; value: unknown }) => {
      const patch: Record<string, unknown> = { [field.name]: value };
      if (resource.key === "tasks" && field.name === "status") {
        patch.completed_at = value === "done" ? row.completed_at ?? new Date().toISOString() : null;
      }
      return saveQueuedRow(userId, resource.table, { id: row.id, ...patch });
    },
    onSuccess: async (result, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["rows", userId, resource.table] });
      onToast(savedLocallyMessage(variables.field.label, result));
    },
    onError: (error, variables) => onToast(`Could not update ${variables.field.label.toLowerCase()}: ${error.message}`, true),
  });
  const toggleHabitCheckin = useMutation({
    mutationFn: async ({ habitId, date, checked }: { habitId: string; date: string; checked: boolean }) => {
      if (checked) {
        await enqueueDelete(userId, "habit_completions", "", { habit_id: habitId, completed_on: date });
        return syncQueuedChanges(userId);
      }
      return saveQueuedRow(userId, "habit_completions", { habit_id: habitId, completed_on: date }, {
        onConflict: "user_id,habit_id,completed_on",
      });
    },
    onSuccess: async (result, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["rows", userId, "habit_completions"] });
      onToast(savedLocallyMessage(variables.checked ? "Habit check-in removed" : "Habit check-in", result));
    },
    onError: (error) => onToast(`Could not update habit check-in: ${error.message}`, true),
  });
  const filtered = (rows.data ?? [])
    .filter((row) => Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(filter.toLowerCase())))
    .filter((row) => resource.key !== "tasks" || (
      (priorityFilter === "all" || String(row.priority ?? "medium") === priorityFilter)
      && (statusFilter === "all" || String(row.status) === statusFilter)
      && (areaFilter === "all" || String(row.area) === areaFilter)
    ))
    .filter((row) => resource.key !== "transactions"
      || (!transactionFrom || String(row.transaction_date ?? "") >= transactionFrom)
      && (!transactionTo || String(row.transaction_date ?? "") <= transactionTo))
    .sort((a, b) => {
      if (sortMode === "priority" && resource.key === "tasks") {
        const priority = (priorityRank[String(a.priority ?? "medium")] ?? 1) - (priorityRank[String(b.priority ?? "medium")] ?? 1);
        if (priority) return priority;
        const dueDate = String(a.due_date ?? "9999").localeCompare(String(b.due_date ?? "9999"));
        if (dueDate) return dueDate;
      }
      const aActivity = new Date(String(a.updated_at ?? a.created_at ?? 0)).getTime();
      const bActivity = new Date(String(b.updated_at ?? b.created_at ?? 0)).getTime();
      return sortMode === "oldest" ? aActivity - bActivity : bActivity - aActivity;
    });
  const loanGroups = resource.key === "loans" ? groupLoans(rows.data ?? []) : [];
  const filteredLoanGroups = loanGroups
    .filter((group) => group.entries.some((row) => Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(filter.toLowerCase()))))
    .sort((a, b) => {
      const aActivity = new Date(String(a.entries[0]?.updated_at ?? a.entries[0]?.created_at ?? 0)).getTime();
      const bActivity = new Date(String(b.entries[0]?.updated_at ?? b.entries[0]?.created_at ?? 0)).getTime();
      return sortMode === "oldest" ? aActivity - bActivity : bActivity - aActivity;
    });
  const recordsPageSize = 20;
  const linkedTransactionIds = new Set((viewingLoanGroup?.entries ?? [])
    .map((row) => String(row.transaction_id ?? "")).filter(Boolean));
  const transactionsForLoanGroup = (linkedTransactions.data ?? [])
    .filter((transaction) => linkedTransactionIds.has(transaction.id))
    .sort((a, b) => String(b.transaction_date ?? "").localeCompare(String(a.transaction_date ?? "")));
  const transactionPageCount = Math.max(1, Math.ceil(transactionsForLoanGroup.length / recordsPageSize));
  const visibleTransactions = transactionsForLoanGroup.slice((transactionPage - 1) * recordsPageSize, transactionPage * recordsPageSize);
  useEffect(() => {
    setTransactionPage(1);
  }, [viewingLoanGroup?.key]);
  useEffect(() => {
    setTransactionPage((page) => Math.min(page, transactionPageCount));
  }, [transactionPageCount]);
  const visibleRecordCount = resource.key === "loans" ? filteredLoanGroups.length : filtered.length;
  const recordPageCount = Math.max(1, Math.ceil(visibleRecordCount / recordsPageSize));
  const visibleLoanGroups = filteredLoanGroups.slice((recordPage - 1) * recordsPageSize, recordPage * recordsPageSize);
  const visibleRows = filtered.slice((recordPage - 1) * recordsPageSize, recordPage * recordsPageSize);
  useEffect(() => {
    setRecordPage(1);
  }, [areaFilter, filter, priorityFilter, resource.key, sortMode, statusFilter, transactionFrom, transactionTo]);
  useEffect(() => {
    setRecordPage((page) => Math.min(page, recordPageCount));
  }, [recordPageCount]);
  const accountBalances = useMemo(() => {
    const balances = new Map<string, number>();
    for (const account of rows.data ?? []) balances.set(String(account.id), Number(account.opening_balance ?? 0));
    for (const transaction of accountTransactions.data ?? []) {
      if (!transaction.account_id) continue;
      const id = String(transaction.account_id);
      const amount = Number(transaction.account_paid_amount ?? transaction.amount ?? 0);
      balances.set(id, (balances.get(id) ?? 0) + (transaction.type === "income" ? amount : -amount));
    }
    return balances;
  }, [accountTransactions.data, rows.data]);
  async function markAsRead(row?: Row) {
    setMarkingAll(true);
    try {
      const affected = row ? [row] : (rows.data ?? []).filter((item) => !item.read_at);
      const readAt = new Date().toISOString();
      for (const notification of affected) {
        await enqueueUpsert(userId, "notifications", { ...notification, read_at: readAt }, { onConflict: "id" });
      }
      const result = await syncQueuedChanges(userId);
      await queryClient.invalidateQueries({ queryKey: ["rows", userId, "notifications"] });
      onToast(savedLocallyMessage(row ? "Notification" : "Unread notifications", result));
    } catch (error) {
      onToast(`Could not update notifications: ${error instanceof Error ? error.message : "Local storage failed."}`, true);
    } finally {
      setMarkingAll(false);
    }
  }
  return <div className="page">
    <div className="title"><div><p className="eyebrow">{resource.table.replaceAll("_", " ").toUpperCase()}</p><h1>{resource.label}</h1><p>{resource.key === "tasks" ? "Keep work moving with clear priorities, categories, and due dates." : resource.key === "habits" ? "Build routines with your own colors, icons, and daily check-ins." : "Create, update, and remove your records. Changes save on this device and sync with Supabase when online."}</p></div>
      <button className="primary" onClick={() => { setEditing(null); setDialog(true); }}><Plus size={16} /> Add {resource.label.replace(/s$/, "").toLowerCase()}</button></div>
    {rows.error && <ErrorState error={rows.error} onRetry={() => void rows.refetch()} />}
    {resource.key === "tasks" && <TaskInsights rows={rows.data ?? []} />}
    {resource.key === "habits" ? <>{habitCompletions.error && <ErrorState error={habitCompletions.error} onRetry={() => void habitCompletions.refetch()} />}<HabitInsights habits={rows.data ?? []} completions={habitCompletions.data ?? []} loading={habitCompletions.isLoading} busy={toggleHabitCheckin.isPending} selectedHabitId={selectedHabitId} onSelectHabit={setSelectedHabitId} onToggleCheckin={(habitId, date, checked) => toggleHabitCheckin.mutate({ habitId, date, checked })} /></>
      : resource.key === "nutrition_entries" ? <NutritionInsights rows={rows.data ?? []} />
        : resource.key !== "tasks" && !["personal_documents", "payment_cards"].includes(resource.key) && <RecordInsights resource={resource} rows={rows.data ?? []} relatedRows={(resource.key === "budgets" ? budgetTransactions.data : categoryTransactions.data) ?? []} />}
    {rows.isLoading ? <LoadingState /> : <section className="panel records-panel">
      <div className="records-toolbar"><div><h2>Your {resource.label.toLowerCase()}</h2><p>{resource.key === "loans"
        ? `${filteredLoanGroups.length} people · ${rows.data?.length ?? 0} entries · private to your account`
        : `${filtered.length} record${filtered.length === 1 ? "" : "s"} · ${rows.data?.length ?? 0} total · private to your account`}</p></div>
        <div className="inline-actions">{resource.key === "notifications" && <button className="secondary" disabled={!online || markingAll || !rows.data?.some((row) => !row.read_at)} onClick={() => void markAsRead()}>Mark all read</button>}
          {resource.key === "transactions" && <><label className="filter-input date-filter"><CalendarDays size={12} /><span>Month</span><input type="month" value={transactionMonth} onChange={(event) => selectTransactionMonth(event.target.value)} aria-label="Select transaction month" /></label>
            <label className="filter-input date-filter"><CalendarDays size={12} /><span>From</span><input type="date" value={transactionFrom} onChange={(event) => setTransactionFrom(event.target.value)} aria-label="Transactions from date" /></label>
            <label className="filter-input date-filter"><CalendarDays size={12} /><span>To</span><input type="date" value={transactionTo} onChange={(event) => setTransactionTo(event.target.value)} aria-label="Transactions to date" /></label></>}
          <label className="filter-input task-filter"><span className="sr-only">Sort records</span><select value={sortMode} onChange={(event) => setSortMode(event.target.value)} aria-label="Sort records">
            {resource.key === "tasks" && <option value="priority">Priority & due date</option>}<option value="recent">Recently updated</option><option value="oldest">Oldest updated</option>
          </select></label>
          {resource.key === "tasks" && <label className="filter-input task-filter"><span className="sr-only">Filter by priority</span><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="all">All priorities</option>{taskPriorities.map((priority) => <option key={priority} value={priority}>{priority[0].toUpperCase() + priority.slice(1)}</option>)}</select></label>}
          {resource.key === "tasks" && <label className="filter-input task-filter"><span className="sr-only">Filter by status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{["todo", "in_progress", "done", "cancelled"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>}
          {resource.key === "tasks" && <label className="filter-input task-filter"><span className="sr-only">Filter by category</span><select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}><option value="all">All categories</option>{Object.keys(areaStyles).map((areaName) => <option key={areaName} value={areaName}>{areaName}</option>)}</select></label>}
          <label className="filter-input"><Search size={15} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={`Filter ${resource.label.toLowerCase()}`} /></label></div></div>
      {!visibleRecordCount ? <EmptyState title={rows.data?.length ? "No matching records" : `No ${resource.label.toLowerCase()} yet`} detail={rows.data?.length ? "Try another search." : "Add your first record. It will be stored on this device and synced to your Supabase account."} action={!rows.data?.length && <button className="text-button" onClick={() => setDialog(true)}><Plus size={14} /> Create first record</button>} />
        : resource.key === "loans" ? <><div className="record-list loan-person-list">{visibleLoanGroups.map((group) => <LoanGroupCard key={group.key} group={group} online={online}
          accountNames={new Map((settlementAccounts.data ?? []).map((account) => [String(account.id), String(account.name)]))}
          onViewTransactions={() => setViewingLoanGroup(group)}
          onEdit={(row) => { setEditing(row); setDialog(true); }}
          onSettle={(row) => setSettlementTarget(row)} />)}</div><Pagination page={recordPage} pageCount={recordPageCount} onChange={setRecordPage} /></>
        : <><div className={`record-list ${["personal_documents", "payment_cards"].includes(resource.key) ? "identity-record-list" : ""}`}>{visibleRows.map((row) => <RecordCard key={row.id} resource={resource} row={row}
          linkedAccountName={(linkedAccounts.data ?? []).find((account) => account.id === row.account_id)?.name as string | undefined}
          checkins={habitCompletions.data ?? []}
          onFieldChange={(field, value) => updateInlineField.mutate({ row, field, value })}
          accountBalance={resource.key === "financial_accounts" ? accountBalances.get(String(row.id)) : undefined}
          onViewHabitCalendar={resource.key === "habits" ? () => setSelectedHabitId(String(row.id)) : undefined}
          onEdit={() => { setEditing(row); setDialog(true); }} onPriorityChange={resource.key === "tasks" ? (priority) => changePriority.mutate({ row, priority }) : undefined} onMarkRead={resource.key === "notifications" && !row.read_at ? () => void markAsRead(row) : undefined} onCheckIn={resource.key === "habits" ? async () => {
          toggleHabitCheckin.mutate({ habitId: row.id, date: today(), checked: false });
        } : undefined} />)}</div>
        <Pagination page={recordPage} pageCount={recordPageCount} onChange={setRecordPage} /></>}
    </section>}
    {dialog && <RecordDialog resource={resource} userId={userId} initial={editing} saving={save.isPending} onClose={() => { if (!save.isPending) { setDialog(false); setEditing(null); } }} onSave={(values) => save.mutate(values)} onDelete={editing ? () => setDeleting(editing) : undefined} />}
    {settlementTarget && <RecordDialog resource={resource} userId={userId} initial={settlementTarget} settlementOnly saving={save.isPending} onClose={() => { if (!save.isPending) setSettlementTarget(null); }} onSave={(values) => save.mutate(values)} />}
    {deleting && <ConfirmDialog title={`Delete ${String(deleting[resource.display] ?? "record")}?`} detail="This cannot be undone. Related records may also be removed according to the database relationship." busy={remove.isPending} onCancel={() => setDeleting(null)} onConfirm={() => remove.mutate(deleting)} />}
    {viewingLoanGroup && <AppPortal><div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewingLoanGroup(null); }}>
      <section className="modal loan-transactions-modal" role="dialog" aria-modal="true" aria-labelledby="loan-transactions-title">
        <div className="modalhead"><div><p className="eyebrow">{viewingLoanGroup.direction.toUpperCase()} · LINKED TRANSACTIONS</p><h2 id="loan-transactions-title">{viewingLoanGroup.personName}</h2></div>
          <button className="icon" aria-label="Close linked transactions" onClick={() => setViewingLoanGroup(null)}><X size={17} /></button></div>
        {linkedTransactions.error && <ErrorState error={linkedTransactions.error} onRetry={() => void linkedTransactions.refetch()} />}
        {linkedTransactions.isLoading ? <LoadingState /> : linkedTransactions.error ? null : transactionsForLoanGroup.length
          ? <><div className="loan-transaction-list">{visibleTransactions.map((transaction) => <article className="loan-transaction" key={transaction.id}>
            <div><b>{displayValue(transaction.title)}</b><small>{configuredDate(String(transaction.transaction_date ?? ""))} · {String(transaction.type ?? "transaction")}</small></div>
            <strong>{loanCurrency(Number(transaction.amount ?? 0))}</strong>
          </article>)}</div><Pagination page={transactionPage} pageCount={transactionPageCount} onChange={setTransactionPage} /></>
          : <EmptyState title="No linked transactions" detail="These balances were added manually or have no transaction linked yet." />}
        <div className="modal-actions"><button className="secondary" onClick={() => setViewingLoanGroup(null)}>Close</button></div>
      </section>
    </div></AppPortal>}
  </div>;
}

function InlineRecordField({ field, value, disabled, onChange, className = "", showLabel = true }: { field: Field; value: unknown; disabled: boolean; onChange: (value: unknown) => void; className?: string; showLabel?: boolean }) {
  const [draft, setDraft] = useState(value === null || value === undefined ? "" : String(value));
  useEffect(() => setDraft(value === null || value === undefined ? "" : String(value)), [value]);
  if (field.type === "select") return <label className={`inline-record-field ${className}`}>
    {showLabel && <small>{field.label}</small>}
    <select value={String(value ?? "")} disabled={disabled} aria-label={field.label} onChange={(event) => onChange(event.target.value)}>
      {field.options?.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}
    </select>
  </label>;
  if (field.type === "checkbox") return <label className="inline-record-field inline-record-checkbox">
    <small>{field.label}</small>
    <input type="checkbox" checked={Boolean(value)} disabled={disabled} aria-label={field.label} onChange={(event) => onChange(event.target.checked)} />
  </label>;
  const required = field.required || field.name === "current_value";
  return <label className={`inline-record-field ${className}`}>
    {showLabel && <small>{field.label}</small>}
    <input type="number" min={field.min} step="any" value={draft} required={required} disabled={disabled} aria-label={field.label}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        if (draft === String(value ?? "")) return;
        if (!event.currentTarget.checkValidity()) { event.currentTarget.reportValidity(); return; }
        onChange(draft === "" ? null : Number(draft));
      }}
      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
  </label>;
}

function RecordCard({ resource, row, onEdit, onCheckIn, onMarkRead, onPriorityChange, onFieldChange, checkins = [], linkedAccountName, accountBalance, onViewHabitCalendar }: {
  resource: Resource; row: Row; onEdit: () => void; onCheckIn?: () => void;
  onMarkRead?: () => void; onPriorityChange?: (priority: string) => void;
  onFieldChange: (field: Field, value: unknown) => void; checkins?: Row[];
  linkedAccountName?: string;
  accountBalance?: number;
  onViewHabitCalendar?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const hiddenDetails = resource.key === "tasks" ? ["status", "recurrence", "description"] : [];
  const detailFields = resource.fields.filter((field) => ![resource.display, "icon", "color", "priority", "area", ...hiddenDetails].includes(field.name) && row[field.name] !== null && row[field.name] !== undefined && row[field.name] !== "");
  const quickFieldNames = resource.key === "tasks" ? ["status"] : resource.key === "goals" ? ["status", "current_value"] : [];
  const quickFields = quickFieldNames.map((name) => resource.fields.find((field) => field.name === name))
    .filter((field): field is Field => field !== undefined);
  const checkedToday = resource.key === "habits" && checkins.some((item) => item.habit_id === row.id && item.completed_on === today());
  const HabitIcon = habitIcons[String(row.icon)] ?? Flame;
  const area = typeof row.area === "string" ? areaStyles[row.area] : undefined;
  const AreaIcon = area?.icon;
  const isDocument = resource.key === "personal_documents";
  const isPaymentCard = resource.key === "payment_cards";
  const isCompleted = ["done", "completed"].includes(String(row.status ?? "").toLowerCase());
  return <article className={`record-card record-${resource.key} ${isCompleted ? "record-completed" : ""} ${isDocument ? "identity-document-card" : isPaymentCard ? "payment-card-record" : ""}`}>
    {resource.key === "habits" ? <span className={`habit-icon habit-icon-large habit-color-${String(row.color ?? "violet")}`}><HabitIcon size={19} /></span>
      : resource.key === "tasks" ? <span className={`task-marker priority-${String(row.priority ?? "medium")}`} aria-hidden="true" /> : null}
    <div className="record-info">{isDocument ? <div className="identity-document-template">
      <div className="identity-template-top"><span className="identity-template-icon"><Fingerprint size={17} /></span><span className="identity-type-label">{String(row.document_type ?? "document").replaceAll("_", " ")}</span></div>
      <div className="identity-document-title"><h3>{displayValue(row.document_name)}</h3><span>{String(row.issuing_authority ?? "Personal document")}</span></div>
      <div className="identity-sensitive-line"><div><small>Document number</small><b>{revealed ? displayValue(row.document_number) : maskedValue(row.document_number)}</b></div>
        <button className="text-button reveal-sensitive" type="button" aria-label={`${revealed ? "Mask" : "Reveal"} document number`} aria-pressed={revealed} onClick={() => setRevealed((value) => !value)}>{revealed ? <EyeOff size={14} /> : <Eye size={14} />}{revealed ? "Hide" : "Reveal"}</button></div>
      <div className="identity-document-meta"><span><small>Name on document</small><b>{displayValue(row.holder_name)}</b></span>
        <span><small>Expiry</small><b>{row.expiry_date ? configuredDate(String(row.expiry_date)) : "No expiry date"}</b></span></div>
    </div> : isPaymentCard ? <div className={`payment-card-template payment-card-${String(row.card_type ?? "other")}`}>
      <div className="payment-card-top"><span className="payment-card-chip" aria-hidden="true" /><CreditCard size={19} /><span className="payment-card-kind">{String(row.card_type ?? "card").replaceAll("_", " ")}</span></div>
      <h3>{displayValue(row.card_name)}</h3>
      <div className="payment-card-number"><span>{revealed ? "•••• •••• •••• " : "•••• •••• •••• ••••"}</span>{revealed && <b>{displayValue(row.last_four)}</b>}</div>
      <div className="payment-card-meta"><span><small>ISSUER</small><b>{displayValue(row.issuer)}</b></span><span><small>NETWORK</small><b>{displayValue(row.network)}</b></span>
        <span><small>EXPIRES</small><b>{row.expiry_date ? configuredDate(String(row.expiry_date)) : "—"}</b></span></div>
      {linkedAccountName && <small className="payment-card-account">Linked to {linkedAccountName}</small>}
      <button className="payment-card-reveal" type="button" aria-label={`${revealed ? "Mask" : "Reveal"} last four card digits`} aria-pressed={revealed} onClick={() => setRevealed((value) => !value)}>{revealed ? <EyeOff size={13} /> : <Eye size={13} />}{revealed ? "Hide details" : "Reveal last four"}</button>
    </div> : <><div className="record-heading"><h3>{displayValue(row[resource.display])}</h3>{row.status && !["tasks", "goals"].includes(resource.key) ? <span className="badge">{String(row.status).replaceAll("_", " ")}</span> : null}
        {area && AreaIcon && !["tasks", "goals"].includes(resource.key) && <span className={`category-badge ${area.className}`}><AreaIcon size={12} />{String(row.area)}</span>}
      </div>
      {!["goals", "habits"].includes(resource.key) && <div className="record-details">{(expanded ? detailFields : detailFields.slice(0, 2)).map((field) => <span className={`record-detail-${field.name}`} key={field.name}><small>{field.label}</small>{resource.key === "tasks" && field.name === "due_date" && typeof row.due_date === "string" && !Number.isNaN(new Date(row.due_date).getTime()) ? `${configuredDate(row.due_date)} · ${configuredTime(row.due_date)}` : field.sensitive ? maskedValue(row[field.name]) : displayValue(row[field.name])}</span>)}
        {resource.key === "financial_accounts" && accountBalance !== undefined && <span className="record-account-balance"><small>Current balance</small>{accountBalance.toFixed(2)} {String(row.currency ?? "")}</span>}
        {resource.key === "transactions" && row.type === "expense" && row.account_paid_amount !== undefined && Number(row.account_paid_amount) > 0
          && <span><small>Paid from account</small>{Number(row.account_paid_amount).toFixed(2)}</span>}
        <small className="record-created">{row.updated_at && row.updated_at !== row.created_at ? `Updated ${configuredDate(String(row.updated_at))}` : row.created_at ? `Added ${configuredDate(String(row.created_at))}` : ""}</small></div>}
      {detailFields.length > 2 && !["goals", "habits"].includes(resource.key) && <button className="text-button record-expand" aria-expanded={expanded} onClick={() => setExpanded((open) => !open)}>{expanded ? "Show less" : `View all ${detailFields.length} details`}<ChevronDown className={expanded ? "record-expand-icon is-expanded" : "record-expand-icon"} size={13} /></button>}</>}
    </div><div className={`record-actions ${["tasks", "goals"].includes(resource.key) ? "record-actions-compact" : ""}`}><div className="record-action-stack">
      {onCheckIn && <button className={`secondary check-in ${checkedToday ? "checked-in" : ""}`} disabled={checkedToday} onClick={onCheckIn}>{checkedToday ? "Done today" : "Check in"}</button>}
      {onViewHabitCalendar && <button className="secondary check-in" onClick={onViewHabitCalendar}>View calendar</button>}
      {resource.key === "tasks" && onPriorityChange && <select className={`priority-select priority-${String(row.priority ?? "medium")}`} value={String(row.priority ?? "medium")} aria-label={`Set priority for ${String(row.title)}`} onChange={(event) => onPriorityChange(event.target.value)}>{taskPriorities.map((priority) => <option key={priority} value={priority}>{priority[0].toUpperCase() + priority.slice(1)}</option>)}</select>}
      {quickFields.map((field) => <InlineRecordField key={field.name} className={`quick-record-field quick-record-field-${field.name}`} field={field} value={row[field.name]} disabled={false} showLabel={false} onChange={(value) => onFieldChange(field, value)} />)}
      {onMarkRead && <button className="secondary check-in" onClick={onMarkRead}>Mark read</button>}
      </div>
      <button className="icon" aria-label={`Edit ${String(row[resource.display] ?? "record")}`} onClick={onEdit}><Settings size={15} /></button>
    </div></article>;
}

function LoanGroupCard({ group, online, accountNames, onViewTransactions, onEdit, onSettle }: {
  group: LoanGroup;
  online: boolean;
  accountNames: Map<string, string>;
  onViewTransactions: () => void;
  onEdit: (row: Row) => void;
  onSettle: (row: Row) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const amount = loanCurrency(group.outstandingAmount);
  return <article className="record-card loan-person-card">
    <div className="record-info">
      <div className="record-heading"><h3>{group.personName}</h3><span className="badge">{group.direction}</span></div>
      <div className="loan-person-balance"><small>Outstanding</small><strong>{amount}</strong><span>{group.entries.length} entr{group.entries.length === 1 ? "y" : "ies"}</span></div>
      <div className="loan-person-actions">
        <button className="secondary" onClick={onViewTransactions}>View transactions</button>
        <button className="text-button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Hide entries" : "Manage entries"}
        </button>
      </div>
      {expanded && <div className="loan-person-entries">{group.entries.map((entry) => <div className="loan-entry" key={entry.id}>
        <div><b>{loanCurrency(Number(entry.amount ?? 0))}</b><small>{configuredDate(String(entry.loan_date ?? ""))}{entry.is_settled ? ` · Settled${entry.settlement_account_id ? ` from ${accountNames.get(String(entry.settlement_account_id)) ?? "selected account"}` : ""}` : ""}</small>
          {entry.notes !== null && entry.notes !== undefined && entry.notes !== "" && <small>{String(entry.notes)}</small>}</div>
        <div className="inline-actions"><button className="icon" disabled={!online || Boolean(entry.is_settled)} aria-label={entry.is_settled ? "Already settled" : `Settle ${loanCurrency(Number(entry.amount ?? 0))}`} title={entry.is_settled ? "Already settled" : "Settle"} onClick={() => onSettle(entry)}><Check size={15} /></button><button className="secondary" disabled={!online} onClick={() => onEdit(entry)}>Edit</button></div>
      </div>)}</div>}
    </div>
  </article>;
}

function RecordDialog({ resource, userId, initial, saving, onClose, onSave, onDelete, settlementOnly = false }: { resource: Resource; userId: string; initial: Row | null; saving: boolean; onClose: () => void; onSave: (values: Record<string, unknown>) => void; onDelete?: () => void; settlementOnly?: boolean }) {
  const formFields = settlementOnly
    ? resource.fields.filter((field) => ["settlement_account_id", "settled_at"].includes(field.name))
    : fieldsForRecord(resource, Boolean(initial));
  const defaults = useMemo<Record<string, unknown>>(() => ({
    ...Object.fromEntries(resource.fields.map((field) => [field.name, defaultValue(field, initial?.[field.name])])),
    ...(settlementOnly ? { is_settled: true, settled_at: initial?.settled_at ?? today() } : {}),
    funding_source: "account",
    account_paid_amount: "",
    borrowed_amount: "",
  }), [initial, resource, settlementOnly]);
  const { register, handleSubmit, reset, setError, setValue, watch, formState: { errors } } = useForm<Record<string, unknown>>({
    defaultValues: defaults,
  });
  useEffect(() => reset(defaults), [defaults, reset]);
  const schema = useMemo(() => validateSchema(formFields), [formFields]);
  const primaryTransactionFields = resource.key === "transactions" ? new Set(["category_id"]) : new Set<string>();
  const requiredFields = formFields.filter((field) => field.required || primaryTransactionFields.has(field.name));
  const transactionType = watch("type");
  useEffect(() => {
    if (resource.key === "transactions" && !initial) setValue("category_id", "");
  }, [initial, resource.key, setValue, transactionType]);
  const showFundingFields = resource.key === "transactions" && !initial && transactionType === "expense";
  const optionalFields = formFields.filter((field) => !field.required && !primaryTransactionFields.has(field.name) && !(showFundingFields && field.name === "account_id"));
  const accountOptions = useRows("financial_accounts", userId, showFundingFields);
  const fundingSource = watch("funding_source");
  const transactionAmount = watch("amount");
  const renderField = (field: Field) => <label key={field.name} className={`form-field ${field.type === "textarea" ? "field-wide" : ""}`}>
    <span>{field.label}{(field.required || primaryTransactionFields.has(field.name)) && <i> *</i>}</span>
    {field.type === "relation" ? <RelationInput field={field} userId={userId} register={register(field.name, { required: field.required || primaryTransactionFields.has(field.name) })} filterType={field.name === "category_id" ? String(transactionType ?? "") : undefined} />
      : field.type === "select" ? <select defaultValue={String(defaults[field.name] || field.options?.[0] || "")} {...register(field.name, { required: field.required })} aria-label={field.label}>
        {field.options?.map((option) => <option key={option} value={option}>{option.replaceAll("_", " ")}</option>)}</select>
        : field.type === "textarea" ? <textarea rows={3} {...register(field.name)} />
          : <input type={field.type ?? "text"} min={field.min} step={field.type === "number" ? "any" : undefined} required={field.required} {...register(field.name, { valueAsNumber: field.type === "number" })} />}
    {errors[field.name]?.message && <small className="field-error">{String(errors[field.name]?.message)}</small>}
  </label>;
  function submit(values: Record<string, unknown>) {
    if (resource.key === "payment_cards" && values.last_four && !/^\d{4}$/.test(String(values.last_four))) {
      setError("last_four", { message: "Enter exactly the last four digits." });
      return;
    }
    if (resource.key === "loans" && values.is_settled && !initial?.is_settled && !String(values.settlement_account_id ?? "")) {
      setError("settlement_account_id", { message: "Choose the account used for settlement." });
      return;
    }
    if (showFundingFields) {
      if (fundingSource === "account") {
        values.account_paid_amount = Number(values.amount);
        values.borrowed_amount = 0;
        values.borrowed_from = "";
      } else if (fundingSource === "borrowed") {
        values.account_paid_amount = 0;
        values.borrowed_amount = Number(values.amount);
        values.account_id = "";
      } else if (fundingSource === "lent") {
        values.account_paid_amount = Number(values.amount);
        values.borrowed_amount = Number(values.amount);
      }
      const totalCents = Math.round(Number(values.amount) * 100);
      const accountCents = Math.round(Number(values.account_paid_amount || 0) * 100);
      const borrowedCents = Math.round(Number(values.borrowed_amount || 0) * 100);
      const amountsAreValid = fundingSource === "lent"
        ? accountCents === totalCents && borrowedCents === totalCents
        : accountCents + borrowedCents === totalCents;
      if (!amountsAreValid) {
        setError("account_paid_amount", { message: "Account and borrowed amounts must add up to the expense total." });
        setError("borrowed_amount", { message: "Account and borrowed amounts must add up to the expense total." });
        return;
      }
      if (accountCents > 0 && !values.account_id) {
        setError("account_id", { message: "Choose the account used for this payment." });
        return;
      }
      if (borrowedCents > 0 && !String(values.borrowed_from ?? "").trim()) {
        setError("borrowed_from", { message: "Enter the person you borrowed from." });
        return;
      }
      if (borrowedCents === 0) values.borrowed_from = "";
      if (accountCents === 0) values.account_id = "";
    }
    const result = schema.safeParse(values);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const name = issue.path[0];
        if (typeof name === "string") setError(name, { message: issue.message });
      }
      return;
    }
    onSave(settlementOnly ? { ...initial, ...values, is_settled: true } : values);
  }
  return createPortal(<div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="modal record-modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="modalhead"><div><p className="eyebrow">{settlementOnly ? "SETTLE BALANCE" : initial ? "EDIT RECORD" : "NEW RECORD"}</p><h2 id="dialog-title">{settlementOnly ? `Settle ${String(initial?.person_name ?? "loan")}` : `${initial ? "Update" : "Add"} ${resource.label.replace(/s$/, "").toLowerCase()}`}</h2></div>
        <button className="icon" aria-label="Close dialog" disabled={saving} onClick={onClose}><X size={17} /></button></div>
      <form onSubmit={(event) => void handleSubmit(submit)(event)} noValidate>
        <p className="record-form-hint">{resource.key === "personal_documents"
          ? "ID numbers are masked in the record list. Add only details you need to keep here."
          : initial && editFieldNames[resource.key]
            ? "Only status and measurement values can be changed here. Other record details stay the same."
            : resource.key === "payment_cards"
            ? "Only the last four digits are stored. Never enter your full card number, PIN, or CVV."
            : initial ? "Update the fields you need. Optional details are grouped below." : "Start with the required details. You can add more information whenever you need."}</p>
        <div className="form-grid">{requiredFields.map(renderField)}</div>
        {showFundingFields && <section className="transaction-funding">
          <div className="transaction-funding-heading"><b>How was this expense paid?</b><small>Choose an account, record borrowing, or track money lent to someone.</small></div>
          <label className="form-field"><span>Payment source</span><select {...register("funding_source")} aria-label="Payment source">
            <option value="account">From an account</option><option value="borrowed">Borrowed from someone</option><option value="split">Split between account and borrowing</option><option value="lent">Lent to someone</option>
          </select></label>
          {(fundingSource === "account" || fundingSource === "split") && <>
            <label className="form-field"><span>Account *</span><select {...register("account_id")} required aria-label="Account used for expense">
              <option value="">Select account…</option>{(accountOptions.data ?? []).map((account) => <option key={account.id} value={account.id}>{String(account.name)}</option>)}
            </select>{errors.account_id?.message && <small className="field-error">{String(errors.account_id.message)}</small>}</label>
            {fundingSource === "split" && <label className="form-field"><span>Paid from account *</span><input type="number" min="0.01" max={Number(transactionAmount) || undefined} step="0.01" required {...register("account_paid_amount", { valueAsNumber: true })} placeholder="0.00" />
              {errors.account_paid_amount?.message && <small className="field-error">{String(errors.account_paid_amount.message)}</small>}</label>}
          </>}
          {fundingSource === "lent" && <label className="form-field"><span>Account *</span><select {...register("account_id")} required aria-label="Account used for lending">
            <option value="">Select account…</option>{(accountOptions.data ?? []).map((account) => <option key={account.id} value={account.id}>{String(account.name)}</option>)}
          </select>{errors.account_id?.message && <small className="field-error">{String(errors.account_id.message)}</small>}</label>}
          {(fundingSource === "borrowed" || fundingSource === "split" || fundingSource === "lent") && <>
            <label className="form-field"><span>{fundingSource === "lent" ? "Lent to *" : "Borrowed from *"}</span><input type="text" placeholder="Person’s name" {...register("borrowed_from")} />
              {errors.borrowed_from?.message && <small className="field-error">{String(errors.borrowed_from.message)}</small>}</label>
            {fundingSource === "split" && <label className="form-field"><span>Borrowed amount *</span><input type="number" min="0.01" max={Number(transactionAmount) || undefined} step="0.01" {...register("borrowed_amount", { valueAsNumber: true })} placeholder="0.00" />
              {errors.borrowed_amount?.message && <small className="field-error">{String(errors.borrowed_amount.message)}</small>}</label>
            }
          </>}
          <p className="transaction-funding-total">Expense total: {Number(transactionAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{fundingSource === "split" && <span>Paid from account and borrowed amounts must total this value.</span>}{fundingSource === "lent" && <span>The full expense is paid from the selected account and tracked as lent to this person.</span>}</p>
        </section>}
        {optionalFields.length > 0 && <details className="advanced-fields" open={Boolean(initial)}>
          <summary>Additional details <span>{optionalFields.length} optional</span></summary>
          <div className="form-grid">{optionalFields.map(renderField)}
          </div>
        </details>}
        <div className="modal-actions">{onDelete && <button type="button" className="danger-button record-delete-action" onClick={onDelete} disabled={saving}><Trash2 size={14} /> Delete</button>}<span className="modal-actions-spacer" /><button type="button" className="secondary" onClick={onClose} disabled={saving}>Cancel</button><button className="primary" type="submit" disabled={saving}>{saving ? "Saving…" : initial ? "Save changes" : `Save ${resource.label.replace(/s$/, "").toLowerCase()}`}</button></div>
      </form>
    </section>
  </div>, document.body);
}

function RelationInput({ field, userId, register, filterType }: { field: Field; userId: string; register: UseFormRegisterReturn; filterType?: string }) {
  const options = useRows(field.relationTable ?? "", userId, Boolean(field.relationTable && userId));
  return <select {...register} required={field.required || field.name === "category_id"}><option value="">Select…</option>
    {(options.data ?? []).filter((row) => !filterType || String(row.type ?? "") === filterType).map((row) => <option key={row.id} value={row.id}>{String(row[field.relationLabel ?? "name"] ?? row.id)}</option>)}
  </select>;
}

function CalendarPage({ userId, onToast, online, weekStartsOn, openRequest, onQuickAddConsumed }: { userId: string; onToast: (text: string, error?: boolean) => void; online: boolean; weekStartsOn: number; openRequest: number; onQuickAddConsumed: () => void }) {
  const events = useRows("calendar_events", userId);
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<"agenda" | "day" | "week" | "month">("month");
  const [anchorDate, setAnchorDate] = useState(today);
  const [area, setArea] = useState("all");
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [eventDraft, setEventDraft] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  useEffect(() => {
    if (openRequest > 0) {
      setEditing(null);
      setEventDraft({
        id: "draft",
        user_id: userId,
        starts_at: new Date(`${anchorDate}T09:00:00`).toISOString(),
        area: "Personal",
        recurrence: "none",
      });
      setDialog(true);
      onQuickAddConsumed();
    }
  }, [anchorDate, onQuickAddConsumed, openRequest, userId]);
  const addEvent = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const payload = cleanFormValues(values, resourceFor("calendar_events")!.fields);
      return saveQueuedRow(userId, "calendar_events", { ...payload, id: editing?.id ?? crypto.randomUUID() });
    },
    onSuccess: async (result) => { await queryClient.invalidateQueries({ queryKey: ["rows", userId, "calendar_events"] }); setDialog(false); setEditing(null); setEventDraft(null); onToast(savedLocallyMessage("Calendar event", result)); },
    onError: (error) => onToast(`Could not save event: ${error.message}`, true),
  });
  const anchor = new Date(`${anchorDate}T12:00:00`);
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const monthGridStart = new Date(monthStart);
  monthGridStart.setDate(1 - ((monthStart.getDay() - weekStartsOn + 7) % 7));
  const monthDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(monthGridStart);
    date.setDate(monthGridStart.getDate() + index);
    return date;
  });
  const weekStart = new Date(anchor);
  weekStart.setDate(anchor.getDate() - ((anchor.getDay() - weekStartsOn + 7) % 7));
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return date;
  });
  const visibleStart = new Date(period === "month" ? monthGridStart : period === "week" ? weekStart : anchor);
  visibleStart.setHours(0, 0, 0, 0);
  const visibleEnd = new Date(visibleStart);
  visibleEnd.setDate(visibleEnd.getDate() + (period === "month" ? 42 : period === "week" ? 7 : period === "day" ? 1 : 90));
  const openNewEvent = (date: string) => {
    setEditing(null);
    setEventDraft({
      id: "draft",
      user_id: userId,
      starts_at: new Date(`${date}T09:00:00`).toISOString(),
      area: "Personal",
      recurrence: "none",
    });
    setDialog(true);
  };
  const shiftDate = (direction: -1 | 1) => {
    const next = new Date(`${anchorDate}T12:00:00`);
    next.setDate(1);
    if (period === "month") next.setMonth(next.getMonth() + direction);
    else next.setDate(next.getDate() + direction * (period === "week" ? 7 : 1));
    setAnchorDate(localDateKey(next));
  };
  const filtered = expandCalendarEvents(events.data ?? [], visibleStart, visibleEnd).filter((event) => {
    if (area !== "all" && event.area !== area) return false;
    const date = new Date(String(event.starts_at));
    if (period === "day") return localDateKey(date) === anchorDate;
    if (period === "week") { const start = localDateKey(weekStart); const end = localDateKey(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7)); const key = localDateKey(date); return key >= start && key < end; }
    if (period === "month") return date.getMonth() === anchor.getMonth() && date.getFullYear() === anchor.getFullYear();
    return true;
  }).sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
  const gridEvents = expandCalendarEvents(events.data ?? [], visibleStart, visibleEnd)
    .filter((event) => area === "all" || event.area === area);
  const remove = useMutation({
    mutationFn: async (row: Row) => deleteQueuedRow(userId, "calendar_events", row.id),
    onSuccess: async (result) => { await queryClient.invalidateQueries({ queryKey: ["rows", userId, "calendar_events"] }); setDeleting(null); setDialog(false); setEditing(null); onToast(savedLocallyMessage("Event deleted", result)); },
    onError: (error) => onToast(`Could not delete event: ${error.message}`, true),
  });
  const eventResource = resourceFor("calendar_events")!;
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => new Date(2024, 0, 7 + weekStartsOn + index).toLocaleDateString(undefined, { weekday: "short" }));
  const periodLabel = period === "month" ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : period === "day" ? anchor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
      : period === "week" ? `${configuredDate(weekStart)} – ${configuredDate(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6))}`
        : "All events";
  return <div className="page"><div className="title"><div><p className="eyebrow">YOUR PERSONAL SCHEDULE</p><h1>Calendar</h1><p>Events are stored on this device first, then synced to your private Supabase account when online.</p></div><button className="primary" disabled={!online} onClick={() => openNewEvent(anchorDate)}><Plus size={16} /> Add event</button></div>
    {events.error && <ErrorState error={events.error} onRetry={() => void events.refetch()} />}
    <section className="panel"><div className="calendar-toolbar"><div className="calendar-controls"><div className="view-tabs" role="group" aria-label="Calendar period">{(["agenda", "day", "week", "month"] as const).map((view) => <button key={view} className={period === view ? "selected" : ""} onClick={() => setPeriod(view)}>{view[0].toUpperCase() + view.slice(1)}</button>)}</div>
        <div className="calendar-date"><button className="icon" aria-label="Previous period" onClick={() => shiftDate(-1)}><ChevronLeft size={15} /></button><b>{periodLabel}</b><button className="icon" aria-label="Next period" onClick={() => shiftDate(1)}><ChevronRight size={15} /></button></div>
        <label className="calendar-date-input">Go to date<input aria-label="Go to date" type="date" value={anchorDate} onChange={(event) => setAnchorDate(event.target.value)} /></label></div>
      <label className="filter-input"><span className="sr-only">Filter by area</span><select value={area} onChange={(event) => setArea(event.target.value)}><option value="all">All areas</option>{["Personal", "Professional", "Fitness", "Finance"].map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></label></div>
      {(period === "month" || period === "week") && <div className="calendar-grid" role="group" aria-label={`${periodLabel} calendar`}>
        {weekdayLabels.map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}
        {(period === "month" ? monthDays : weekDays).map((date) => {
          const dateKey = localDateKey(date);
          const dayEvents = gridEvents.filter((event) => localDateKey(new Date(String(event.starts_at))) === dateKey);
          return <button key={dateKey} className={`calendar-cell ${date.getMonth() === anchor.getMonth() ? "" : "outside-month"} ${dateKey === today() ? "today-cell" : ""}`} disabled={!online} onClick={() => openNewEvent(dateKey)} aria-label={`Create event on ${date.toLocaleDateString()}`}>
            <span className="calendar-day-number">{date.getDate()}</span>
            <span className="calendar-cell-events">{dayEvents.slice(0, 2).map((event) => <span className={`calendar-event-chip area-${String(event.area).toLowerCase()}`} key={String(event.occurrence_key)} title={String(event.title)}>{String(event.title)}</span>)}
              {dayEvents.length > 2 && <small>+{dayEvents.length - 2} more</small>}</span>
          </button>;
        })}
      </div>}
      {events.isLoading ? <LoadingState /> : filtered.length ? <div className="record-list">{filtered.map((event) => <article className="record-card calendar-event" key={String(event.occurrence_key)}>
        <time className="event-date"><b>{new Date(String(event.starts_at)).toLocaleDateString(undefined, { day: "2-digit" })}</b><small>{new Date(String(event.starts_at)).toLocaleDateString(undefined, { month: "short" })}</small></time>
        <div className="record-info"><div className="record-heading"><h3>{String(event.title)}</h3><span className="badge">{String(event.area)}</span></div><div className="record-details"><span><small>Starts</small>{new Date(String(event.starts_at)).toLocaleString()}</span>{event.ends_at ? <span><small>Ends</small>{new Date(String(event.ends_at)).toLocaleString()}</span> : null}{event.description ? <span><small>Details</small>{String(event.description)}</span> : null}{event.recurrence !== "none" ? <span><small>Repeats</small>{String(event.recurrence)}</span> : null}</div></div>
        <div className="record-actions"><button className="icon" aria-label={`Edit ${String(event.title)}`} disabled={!online} onClick={() => { setEditing(events.data?.find((item) => item.id === event.id) ?? event); setEventDraft(null); setDialog(true); }}><Settings size={15} /></button></div>
      </article>)}</div> : <EmptyState title="No events in this view" detail="Create an event or adjust the date range and area filter." action={<button className="text-button" disabled={!online} onClick={() => openNewEvent(anchorDate)}><Plus size={14} /> Add event</button>} />}
    </section>
    {dialog && <RecordDialog resource={eventResource} userId={userId} initial={editing ?? eventDraft} saving={addEvent.isPending} onClose={() => { setDialog(false); setEditing(null); setEventDraft(null); }} onSave={(values) => addEvent.mutate(values)} onDelete={editing ? () => setDeleting(editing) : undefined} />}
    {deleting && <ConfirmDialog title={`Delete ${String(deleting.title)}?`} detail={deleting.recurrence !== "none" ? "This deletes the recurring event series and its future occurrences." : "This calendar event will be permanently removed."} busy={remove.isPending} onCancel={() => setDeleting(null)} onConfirm={() => remove.mutate(deleting)} />}
  </div>;
}

function SettingsPage({ userId, session, profile, preferences, theme, setTheme, onToast, onSignOut }: {
  userId: string; session: Session; profile: Row | null | undefined; preferences: Row | null | undefined; theme: Theme;
  setTheme: (theme: Theme) => void; onToast: (text: string, error?: boolean) => void; onSignOut: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(String(profile?.display_name ?? ""));
  const [timezone, setTimezone] = useState(String(profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone));
  const [avatarPath, setAvatarPath] = useState(String(profile?.avatar_url ?? ""));
  const [avatarPreview, setAvatarPreview] = useState("");
  const [currencyCode, setCurrencyCode] = useState(String(preferences?.currency ?? "INR"));
  const [dateFormat, setDateFormat] = useState(String(preferences?.date_format ?? "DD/MM/YYYY"));
  const [weekStartsOn, setWeekStartsOn] = useState(String(preferences?.week_starts_on ?? "1"));
  const [timeFormat, setTimeFormat] = useState(String(preferences?.time_format ?? "24h"));
  const [accentColor, setAccentColor] = useState(String(preferences?.accent_color ?? "#5b82ed"));
  const [journalTheme, setJournalTheme] = useState(String(preferences?.journal_theme ?? "midnight"));
  const [journalTypes, setJournalTypes] = useState<string[]>(Array.isArray(preferences?.journal_data_types) ? preferences.journal_data_types.filter((key): key is string => typeof key === "string") : defaultJournalDataTypes);
  const [journalBook, setJournalBook] = useState<JournalBookSettings>(() => readJournalBookSettings(preferences?.journal_book_settings));
  const [chatId, setChatId] = useState("");
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [deviceNotificationsEnabled, setDeviceNotificationsEnabled] = useState(
    localStorage.getItem(`lifeos-device-notifications-enabled:${userId}`) === "true",
  );
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const notificationPrefs = useRows("notification_preferences", userId);
  const telegram = useRows("telegram_connections", userId);
  const [browserEnabled, setBrowserEnabled] = useState(Boolean(notificationPrefs.data?.[0]?.browser_enabled));
  useEffect(() => {
    if (profile) {
      setName(String(profile.display_name ?? ""));
      setTimezone(String(profile.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone));
      setAvatarPath(String(profile.avatar_url ?? ""));
    }
    if (preferences) {
      setCurrencyCode(String(preferences.currency ?? "INR"));
      setDateFormat(String(preferences.date_format ?? "DD/MM/YYYY"));
      setWeekStartsOn(String(preferences.week_starts_on ?? "1"));
      setTimeFormat(String(preferences.time_format ?? "24h"));
      setAccentColor(String(preferences.accent_color ?? "#5b82ed"));
      setJournalTheme(String(preferences.journal_theme ?? "midnight"));
      setJournalTypes(Array.isArray(preferences.journal_data_types) ? preferences.journal_data_types.filter((key): key is string => typeof key === "string") : defaultJournalDataTypes);
      setJournalBook(readJournalBookSettings(preferences.journal_book_settings));
    }
    if (telegram.data?.[0]) { setChatId(String(telegram.data[0].chat_id)); setTelegramEnabled(Boolean(telegram.data[0].is_enabled)); }
    if (notificationPrefs.data?.[0]) setBrowserEnabled(Boolean(notificationPrefs.data[0].browser_enabled));
  }, [notificationPrefs.data, preferences, profile, telegram.data]);

  useEffect(() => {
    let active = true;
    if (!avatarPath) { setAvatarPreview(""); return; }
    if (!navigator.onLine) { setAvatarPreview(""); return; }
    void supabase!.storage.from("lifeos-private").createSignedUrl(avatarPath, 3600).then(({ data, error }) => {
      if (active && !error) setAvatarPreview(data.signedUrl);
    });
    return () => { active = false; };
  }, [avatarPath]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    try {
      const result = await saveQueuedRow(userId, "profiles", { display_name: name.trim(), timezone, avatar_url: avatarPath || null }, { onConflict: "user_id", cacheId: userId });
      await queryClient.invalidateQueries({ queryKey: ["profile", userId] });
      onToast(savedLocallyMessage("Profile", result));
    } catch (error) { onToast(`Could not save profile: ${error instanceof Error ? error.message : "Local storage failed."}`, true); }
  }
  async function savePreferences(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await saveQueuedRow(userId, "user_preferences", {
        currency: currencyCode.trim().toUpperCase(), date_format: dateFormat,
        week_starts_on: Number(weekStartsOn), time_format: timeFormat, accent_color: accentColor,
      }, { onConflict: "user_id", cacheId: userId });
      document.documentElement.style.setProperty("--user-accent", accentColor);
      await queryClient.invalidateQueries({ queryKey: ["preferences", userId] });
      onToast(savedLocallyMessage("Preferences", result));
    } catch (error) { onToast(`Could not save preferences: ${error instanceof Error ? error.message : "Local storage failed."}`, true); }
  }
  async function saveJournalPreferences(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await saveQueuedRow(userId, "user_preferences", {
        journal_theme: journalTheme, journal_data_types: journalTypes, journal_book_settings: journalBook,
      }, { onConflict: "user_id", cacheId: userId });
      await queryClient.invalidateQueries({ queryKey: ["preferences", userId] });
      onToast(savedLocallyMessage("Journal settings", result));
    } catch (error) { onToast(`Could not save journal settings: ${error instanceof Error ? error.message : "Local storage failed."}`, true); }
  }
  async function updateBrowserNotifications(enabled: boolean) {
    if (enabled && !("Notification" in window)) { onToast("This browser does not support notifications.", true); return; }
    if (enabled) {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { onToast("Browser notification permission was not granted.", true); return; }
    }
    try {
      const result = await saveQueuedRow(userId, "notification_preferences", { browser_enabled: enabled }, { onConflict: "user_id", cacheId: userId });
      setBrowserEnabled(enabled);
      await queryClient.invalidateQueries({ queryKey: ["rows", userId, "notification_preferences"] });
      onToast(savedLocallyMessage(enabled ? "Browser notifications enabled" : "Browser notifications disabled", result));
    } catch (error) { onToast(`Could not save notification preference: ${error instanceof Error ? error.message : "Local storage failed."}`, true); }
  }
  async function updateDeviceNotifications(enabled: boolean) {
    if (enabled && !Capacitor.isNativePlatform()) {
      onToast("Device notifications are available in the Android app.", true);
      return;
    }
    if (enabled) {
      try {
        if (!await requestDeviceNotificationPermission()) {
          onToast("Android notification permission was not granted. Enable it in system settings to receive reminders.", true);
          return;
        }
      } catch (error) {
        onToast(`Could not request notification permission: ${error instanceof Error ? error.message : "Unknown error."}`, true);
        return;
      }
    }
    localStorage.setItem(`lifeos-device-notifications-enabled:${userId}`, String(enabled));
    setDeviceNotificationsEnabled(enabled);
    window.dispatchEvent(new CustomEvent("lifeos-device-notifications-changed", { detail: { userId } }));
    onToast(enabled ? "On-device reminders enabled." : "On-device reminders disabled.");
  }
  async function sendDeviceTestNotification() {
    try {
      if (!await requestDeviceNotificationPermission()) {
        onToast("Android notification permission was not granted.", true);
        return;
      }
      await LocalNotifications.schedule({ notifications: [{
        id: Math.floor(Date.now() % 2_000_000_000) + 1,
        title: "LifeOS",
        body: "On-device notifications are working.",
        schedule: { at: new Date(Date.now() + 1000) },
      }] });
      onToast("A test notification will appear shortly.");
    } catch (error) { onToast(`Could not schedule test notification: ${error instanceof Error ? error.message : "Unknown error."}`, true); }
  }
  async function saveTelegram(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await saveQueuedRow(userId, "telegram_connections", { chat_id: chatId.trim(), is_enabled: telegramEnabled }, { onConflict: "user_id", cacheId: userId });
      await queryClient.invalidateQueries({ queryKey: ["rows", userId, "telegram_connections"] });
      onToast(`${savedLocallyMessage("Telegram connection settings", result)} Sending still requires the Edge Function and bot secret.`);
    } catch (error) { onToast(`Could not save Telegram settings: ${error instanceof Error ? error.message : "Local storage failed."}`, true); }
  }
  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (!navigator.onLine) { onToast("Profile photo upload requires an internet connection.", true); input.value = ""; return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      onToast("Choose a JPEG, PNG, or WebP image smaller than 5 MB.", true);
      input.value = "";
      return;
    }
    const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const path = `${userId}/profile/avatar.${extension}`;
    const { error: uploadError } = await supabase!.storage.from("lifeos-private").upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) { onToast(`Could not upload profile photo: ${uploadError.message}`, true); input.value = ""; return; }
    setAvatarPath(path);
    try {
      const result = await saveQueuedRow(userId, "profiles", { avatar_url: path }, { onConflict: "user_id", cacheId: userId });
      await queryClient.invalidateQueries({ queryKey: ["profile", userId] });
      onToast(savedLocallyMessage("Profile photo", result));
    } catch (error) { onToast(`Photo uploaded but profile could not be updated: ${error instanceof Error ? error.message : "Local storage failed."}`, true); }
    input.value = "";
  }
  async function sendTestNotification() {
    if (!navigator.onLine) { onToast("Telegram test notifications require an internet connection.", true); return; }
    if (!supabase || !telegram.data?.[0]?.chat_id) { onToast("Save a Telegram chat ID first.", true); return; }
    const notificationId = crypto.randomUUID();
    const result = await saveQueuedRow(userId, "notifications", {
      id: notificationId, title: "LifeOS test notification", body: "Your Telegram connection is configured.", type: "integration_test",
    });
    if (result.error || result.remaining) {
      onToast(savedLocallyMessage("Test notification", result), true);
      return;
    }
    const { error } = await supabase.functions.invoke("telegram-notify", { body: { notification_id: notificationId } });
    if (error) onToast(`Telegram test failed: ${error.message}`, true);
    else onToast("Telegram test notification sent.");
  }
  async function exportTable(table: string) {
    try {
      const rows = await loadRows(table, userId);
      if (!rows.length) { onToast(`No ${resourceLabel(table).toLowerCase()} to export.`); return; }
      const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
      const csv = [columns.map(csvCell).join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\r\n");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      link.download = `lifeos-${table}-${today()}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
      onToast(`${resourceLabel(table)} exported.`);
    } catch (error) { onToast(`Export failed: ${error instanceof Error ? error.message : "Unknown error."}`, true); }
  }
  async function exportAllData() {
    try {
      const tables = [...resources.map((resource) => resource.table), "profiles", "user_preferences", "notification_preferences", "telegram_connections"];
      const entries = await Promise.all(tables.map(async (table) => [table, await loadRows(table, userId)] as const));
      const download = document.createElement("a");
      download.href = URL.createObjectURL(new Blob([JSON.stringify({ exported_at: new Date().toISOString(), user_id: userId, data: Object.fromEntries(entries) }, null, 2)], { type: "application/json" }));
      download.download = `lifeos-export-${today()}.json`;
      download.click();
      URL.revokeObjectURL(download.href);
      onToast("All available LifeOS records exported.");
    } catch (error) { onToast(`Data export failed: ${error instanceof Error ? error.message : "Unknown error."}`, true); }
  }
  async function deleteAccount() {
    if (deletingAccount) return;
    if (!navigator.onLine) { onToast("Account deletion requires an internet connection.", true); return; }
    setDeletingAccount(true);
    const { error } = await supabase!.functions.invoke("delete-account");
    if (error) onToast(`Account deletion is not configured: ${error.message}`, true);
    else { setConfirmDeleteAccount(false); await supabase!.auth.signOut(); onToast("Account deleted."); }
    setDeletingAccount(false);
  }
  function sendBrowserTest() {
    if (!("Notification" in window) || Notification.permission !== "granted") {
      onToast("Enable browser notifications and grant permission first.", true);
      return;
    }
    new Notification("LifeOS", { body: "Browser notifications are working." });
  }
  return <div className="page"><div className="title"><div><p className="eyebrow">YOUR PREFERENCES</p><h1>Settings</h1><p>Manage your profile, appearance, notifications, and account data.</p></div></div>
    {notificationPrefs.error && <ErrorState error={notificationPrefs.error} onRetry={() => void notificationPrefs.refetch()} />}
    {telegram.error && <ErrorState error={telegram.error} onRetry={() => void telegram.refetch()} />}
    <div className="settings-grid">
      <section className="panel"><PanelHeading title="Profile" detail="Your LifeOS identity" /><form className="settings-form" onSubmit={(event) => void saveProfile(event)}>
        <div className="avatar-setting">{avatarPreview ? <img src={avatarPreview} alt="Your profile" /> : <span className="avatar">{(name.trim()[0] || "U").toUpperCase()}</span>}
          <label>Profile photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadAvatar(event)} /></label></div>
        <label>Display name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label>Email<input value={session.user.email ?? ""} disabled /></label>
        <label>Time zone<input value={timezone} onChange={(event) => setTimezone(event.target.value)} required /></label>
        <button className="primary" type="submit">Save profile</button></form></section>
      <section className="panel"><PanelHeading title="Appearance & preferences" detail="Theme, currency, date, and time settings are saved to your account" />
        <form className="settings-form" onSubmit={(event) => void savePreferences(event)}>
          <label>Theme<select value={theme} onChange={(event) => setTheme(event.target.value as Theme)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
          <label>Accent color<input type="color" value={accentColor} onChange={(event) => { setAccentColor(event.target.value); document.documentElement.style.setProperty("--user-accent", event.target.value); }} /></label>
          <label>Currency code (for example INR)<input value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)} minLength={3} maxLength={3} required /></label>
          <label>Date format<select value={dateFormat} onChange={(event) => setDateFormat(event.target.value)}><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option></select></label>
          <label>Week starts on<select value={weekStartsOn} onChange={(event) => setWeekStartsOn(event.target.value)}><option value="0">Sunday</option><option value="1">Monday</option><option value="6">Saturday</option></select></label>
          <label>Time format<select value={timeFormat} onChange={(event) => setTimeFormat(event.target.value)}><option value="12h">12-hour</option><option value="24h">24-hour</option></select></label>
          <button className="primary" type="submit">Save preferences</button></form></section>
      <section className="panel journal-settings-panel"><PanelHeading title="Journal book" detail="Choose the page design and which of your records appear in each date’s journal page." />
        <form className="settings-form" onSubmit={(event) => void saveJournalPreferences(event)}>
          <label>Book theme<select value={journalTheme} onChange={(event) => setJournalTheme(event.target.value)}><option value="midnight">Midnight</option><option value="paper">Warm paper</option><option value="sage">Sage</option><option value="lavender">Lavender</option></select></label>
          <label>Cover style<select value={journalBook.coverStyle} onChange={(event) => setJournalBook((current) => ({ ...current, coverStyle: event.target.value as JournalBookSettings["coverStyle"] }))}><option value="midnight">Midnight</option><option value="botanical">Botanical</option><option value="classic">Classic</option><option value="minimal">Minimal</option></select></label>
          <label>Book title<input maxLength={100} value={journalBook.title} onChange={(event) => setJournalBook((current) => ({ ...current, title: event.target.value }))} /></label>
          <label>Subtitle<input maxLength={180} value={journalBook.subtitle} onChange={(event) => setJournalBook((current) => ({ ...current, subtitle: event.target.value }))} /></label>
          <label>Author name<input maxLength={100} value={journalBook.author} onChange={(event) => setJournalBook((current) => ({ ...current, author: event.target.value }))} placeholder={name || "Your name"} /></label>
          <label className="toggle-row"><span><b>Include profile pages</b><small>Add your About, Personal, Professional, Fitness, and Finance pages to the book and e-book</small></span><input type="checkbox" checked={journalBook.includeProfilePages} onChange={(event) => setJournalBook((current) => ({ ...current, includeProfilePages: event.target.checked }))} /></label>
          <fieldset className="journal-profile-options"><legend>Ten opening profile pages</legend>{journalProfileSections.map((section) => <label key={section.key}>{section.title}<textarea rows={4} maxLength={4000} value={journalBook.profile[section.key]} placeholder={section.prompt} onChange={(event) => setJournalBook((current) => ({ ...current, profile: { ...current.profile, [section.key]: event.target.value } }))} /></label>)}</fieldset>
          <fieldset className="journal-data-options"><legend>Automatically include</legend>{journalDataTypes.map((item) => <label className="journal-data-option" key={item.key}><span>{item.label}</span><input type="checkbox" checked={journalTypes.includes(item.key)} onChange={(event) => setJournalTypes((current) => event.target.checked ? [...current, item.key] : current.filter((key) => key !== item.key))} /></label>)}</fieldset>
          <p className="muted">Profile details are private to your account. Activity is shown from its original records and updates automatically; the e-book includes only activity types selected above.</p>
          <button className="primary" type="submit">Save journal settings</button></form></section>
      <section className="panel"><PanelHeading title="Notifications" detail="On-device reminders run locally, including when you are offline." />
        {Capacitor.isNativePlatform() && <><label className="toggle-row"><span><b>On-device reminders</b><small>Schedule tasks, events, bills, habits, and saved reminders on this phone</small></span><input type="checkbox" checked={deviceNotificationsEnabled} onChange={(event) => void updateDeviceNotifications(event.target.checked)} /></label>
          <button className="secondary" disabled={!deviceNotificationsEnabled} onClick={() => void sendDeviceTestNotification()}>Send device test</button></>}
        <label className="toggle-row"><span><b>Browser notifications</b><small>Allow notifications from this browser</small></span><input type="checkbox" checked={browserEnabled} onChange={(event) => void updateBrowserNotifications(event.target.checked)} /></label>
        <button className="secondary" disabled={!browserEnabled} onClick={sendBrowserTest}>Send browser test</button>
        <p className="muted">In-app notification history is available in the Notifications module. Changes require an active internet connection.</p></section>
      <section className="panel"><PanelHeading title="Telegram integration" detail="Only the chat ID is stored in this database; bot tokens stay server-side." />
        <form className="settings-form" onSubmit={(event) => void saveTelegram(event)}><label>Telegram Chat ID<input value={chatId} onChange={(event) => setChatId(event.target.value)} required /></label>
          <label className="toggle-row"><span><b>Enable reminders</b><small>Uses a secured Supabase Edge Function</small></span><input type="checkbox" checked={telegramEnabled} onChange={(event) => setTelegramEnabled(event.target.checked)} /></label>
          <div className="inline-actions"><button className="primary" type="submit">Save Telegram settings</button><button type="button" className="secondary" onClick={() => void sendTestNotification()}>Send test</button></div></form>
        <p className="muted">Delivery is unavailable until <code>telegram-notify</code> is deployed and <code>TELEGRAM_BOT_TOKEN</code> is set as an Edge Function secret.</p></section>
      <section className="panel"><PanelHeading title="Export your data" detail="Download records owned by your account as JSON or CSV." />
        <button className="secondary export-all" onClick={() => void exportAllData()}><Download size={15} /> Export all records as JSON</button>
        <div className="export-list">{["tasks", "transactions", "journal_entries", "calendar_events", "goals"].map((table) => <button className="export-link" key={table} onClick={() => void exportTable(table)}><Download size={15} />{resourceLabel(table)}<span>CSV</span></button>)}</div></section>
      <section className="panel"><PanelHeading title="Connection status" detail="Local changes sync to Supabase when an internet connection is available." />
        <div className="integration-row"><span className={`status-dot ${navigator.onLine ? "" : "muted-dot"}`} />Supabase {navigator.onLine ? "online; changes enabled" : "offline; changes disabled"}</div><div className="integration-row"><span className={`status-dot ${telegram.data?.[0]?.is_enabled ? "" : "muted-dot"}`} />Telegram {telegram.data?.[0]?.is_enabled ? "enabled; delivery needs deployed function" : "not enabled"}</div>
        <div className="integration-row"><span className={`status-dot ${navigator.onLine ? "" : "muted-dot"}`} />Browser {navigator.onLine ? "online" : "offline"}</div></section>
      <section className="panel panel-danger"><PanelHeading title="Account" detail="Sign out or request permanent account deletion." /><div className="inline-actions"><button className="secondary" onClick={onSignOut}><LogOut size={15} /> Sign out</button><button className="danger-button" onClick={() => setConfirmDeleteAccount(true)}><Trash2 size={15} /> Delete account</button></div><p className="muted">Account deletion requires the secured <code>delete-account</code> Edge Function.</p></section>
    </div>
    {confirmDeleteAccount && <ConfirmDialog title="Delete your LifeOS account?" detail="This permanently removes your authentication account and all associated LifeOS data. This cannot be undone." busy={deletingAccount} onCancel={() => setConfirmDeleteAccount(false)} onConfirm={() => void deleteAccount()} />}
  </div>;
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

function OnboardingDialog({ userId, profile, onDone, onToast }: { userId: string; profile: Row; onDone: () => void; onToast: (text: string, error?: boolean) => void }) {
  const [name, setName] = useState(String(profile.display_name ?? ""));
  const [timezone, setTimezone] = useState(String(profile.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone));
  const [personal, setPersonal] = useState(String(profile.personal_goals ?? ""));
  const [fitness, setFitness] = useState(String(profile.fitness_goals ?? ""));
  const [financial, setFinancial] = useState(String(profile.financial_goals ?? ""));
  const [currencyCode, setCurrencyCode] = useState("INR");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase || saving) return;
    setSaving(true);
    try {
      await enqueueUpsert(userId, "profiles", {
        display_name: name.trim(), timezone, personal_goals: personal, fitness_goals: fitness,
        financial_goals: financial, onboarding_complete: true,
      }, { onConflict: "user_id", cacheId: userId });
      await enqueueUpsert(userId, "user_preferences", {
        currency: currencyCode.toUpperCase(), theme: "system",
      }, { onConflict: "user_id", cacheId: userId });
      const result = await syncQueuedChanges(userId);
      onToast(savedLocallyMessage("Welcome to LifeOS. Your profile", result));
      onDone();
    } catch (error) { onToast(`Could not complete setup: ${error instanceof Error ? error.message : "Unknown error."}`, true); }
    finally { setSaving(false); }
  }
  return <AppPortal><div className="overlay"><section className="modal onboarding-modal" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
    <div className="modalhead"><div><p className="eyebrow">LET’S SET UP YOUR SPACE</p><h2 id="onboarding-title">Welcome to LifeOS</h2></div></div>
    <p className="muted">Choose your basic preferences. You can update everything in Settings later.</p>
    <form onSubmit={(event) => void submit(event)}><div className="form-grid">
      <label className="form-field">Display name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
      <label className="form-field">Time zone<input value={timezone} onChange={(event) => setTimezone(event.target.value)} required /></label>
      <label className="form-field">Currency<input value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)} minLength={3} maxLength={3} required /></label>
      <label className="form-field">Personal goals<textarea value={personal} onChange={(event) => setPersonal(event.target.value)} rows={2} /></label>
      <label className="form-field">Fitness goals<textarea value={fitness} onChange={(event) => setFitness(event.target.value)} rows={2} /></label>
      <label className="form-field">Financial goals<textarea value={financial} onChange={(event) => setFinancial(event.target.value)} rows={2} /></label>
    </div><div className="modal-actions"><button className="primary" disabled={saving}>{saving ? "Saving…" : "Finish setup"}</button></div></form>
  </section></div></AppPortal>;
}

function ConfirmDialog({ title, detail, busy, onCancel, onConfirm }: { title: string; detail: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <AppPortal><div className="overlay"><section className="modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
    <div className="modalhead"><h2 id="confirm-title">{title}</h2><button className="icon" aria-label="Close dialog" onClick={onCancel}><X size={16} /></button></div>
    <p className="muted">{detail}</p><div className="modal-actions"><button className="secondary" disabled={busy} onClick={onCancel}>Cancel</button><button className="danger-button" disabled={busy} onClick={onConfirm}>{busy ? "Deleting…" : "Delete"}</button></div>
  </section></div></AppPortal>;
}

function LoadingState({ compact = false }: { compact?: boolean }) {
  return <div className={`loading-state ${compact ? "loading-compact" : ""}`} role="status"><span className="spinner" />Loading your data…</div>;
}
function Pagination({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (page: number) => void }) {
  if (pageCount <= 1) return null;
  return <nav className="pagination" aria-label="Record pages">
    <button className="icon" aria-label="Previous page" disabled={page === 1} onClick={() => onChange(page - 1)}><ChevronLeft size={15} /></button>
    <span>Page <b>{page}</b> of <b>{pageCount}</b></span>
    <button className="icon" aria-label="Next page" disabled={page === pageCount} onClick={() => onChange(page + 1)}><ChevronRight size={15} /></button>
  </nav>;
}
function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return <div className="error-state" role="alert"><b>Could not load data from Supabase.</b><span>{error instanceof Error ? error.message : "Check your connection and project configuration."}</span>{onRetry && <button className="secondary" onClick={onRetry}>Try again</button>}</div>;
}
function ChartEmpty({ text }: { text: string }) {
  return <div className="chart-empty"><Activity size={21} /><p>{text}</p></div>;
}
function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Activity size={18} /></span><b>{title}</b><p>{detail}</p>{action}</div>;
}

export default App;
