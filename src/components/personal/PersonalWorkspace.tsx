import type { ReactNode } from "react";
import { LayoutDashboard } from "lucide-react";
import "./personal-workspace.css";

const links = [
  { key: "personal_dashboard", label: "My day" },
  { key: "tasks", label: "Tasks" },
  { key: "goals", label: "Goals" },
  { key: "habits", label: "Habits" },
  { key: "habit_completions", label: "Check-ins" },
  { key: "mood_entries", label: "Mood" },
  { key: "notifications", label: "Notifications" },
];

export function PersonalWorkspace({ activePage, onNavigate, children }: {
  activePage: string;
  onNavigate: (key: string) => void;
  children: ReactNode;
}) {
  return <section className="workspace-app personal-app">
    <header className="personal-app-header">
      <div className="personal-app-brand"><img className="workspace-brand-mark" src="/icons/lifeos-mark.png" alt="" /><div><small>PERSONAL SPACE</small><b>Your everyday life</b></div></div>
      <nav className="personal-app-nav" aria-label="Personal workspace">
        {links.map((link) => <button key={link.key} className={activePage === link.key ? "selected" : ""} aria-current={activePage === link.key ? "page" : undefined} onClick={() => onNavigate(link.key)}>{link.label}</button>)}
      </nav>
      <button className="personal-app-home" onClick={() => onNavigate("overview")}><LayoutDashboard size={14} /> All life</button>
    </header>
    <div className="personal-app-content">{children}</div>
  </section>;
}
