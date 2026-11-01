import type { ReactNode } from "react";
import { Activity, Dumbbell, LayoutDashboard } from "lucide-react";
import "./fitness-workspace.css";

const links = [
  { key: "fitness_dashboard", label: "Training" },
  { key: "workout_sessions", label: "Sessions" },
  { key: "workout_session_exercises", label: "Exercise log" },
  { key: "weight_entries", label: "Weight" },
  { key: "water_entries", label: "Hydration" },
  { key: "nutrition_entries", label: "Nutrition" },
  { key: "workout_routines", label: "Routines" },
  { key: "workout_routine_exercises", label: "Routine builder" },
  { key: "exercises", label: "Exercises" },
  { key: "fitness_profiles", label: "Targets" },
];

export function FitnessWorkspace({ activePage, onNavigate, children }: {
  activePage: string;
  onNavigate: (key: string) => void;
  children: ReactNode;
}) {
  return <section className="workspace-app fitness-app">
    <header className="fitness-app-header">
      <div className="fitness-app-title"><span><Dumbbell size={18} /></span><div><small>FITNESS CLUB</small><b>Training log</b></div><i><Activity size={13} /> YOUR PACE</i></div>
      <nav className="fitness-app-nav" aria-label="Fitness workspace">
        {links.map((link) => <button key={link.key} className={activePage === link.key ? "selected" : ""} aria-current={activePage === link.key ? "page" : undefined} onClick={() => onNavigate(link.key)}>{link.label}</button>)}
        <button className="fitness-app-home" onClick={() => onNavigate("overview")}><LayoutDashboard size={13} /> LifeOS</button>
      </nav>
    </header>
    <div className="fitness-app-content">{children}</div>
  </section>;
}
