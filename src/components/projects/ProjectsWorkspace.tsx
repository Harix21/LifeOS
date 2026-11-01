import type { ReactNode } from "react";
import { BriefcaseBusiness, Clock3, LayoutDashboard, ListChecks, Target } from "lucide-react";
import "./projects-workspace.css";

const links = [
  { key: "project_dashboard", label: "Portfolio", icon: LayoutDashboard },
  { key: "projects", label: "Projects", icon: BriefcaseBusiness },
  { key: "project_milestones", label: "Milestones", icon: Target },
  { key: "time_entries", label: "Time log", icon: Clock3 },
  { key: "skills", label: "Skills", icon: ListChecks },
  { key: "job_applications", label: "Career pipeline", icon: BriefcaseBusiness },
];

export function ProjectsWorkspace({ activePage, onNavigate, children }: {
  activePage: string;
  onNavigate: (key: string) => void;
  children: ReactNode;
}) {
  return <section className="workspace-app projects-app">
    <header className="projects-app-header">
      <div className="projects-app-brand"><span><BriefcaseBusiness size={18} /></span><div><small>PROJECT STUDIO</small><b>Plan. Build. Deliver.</b></div></div>
      <nav aria-label="Projects workspace">{links.map((link) => { const Icon = link.icon; return <button key={link.key} className={activePage === link.key ? "selected" : ""} aria-current={activePage === link.key ? "page" : undefined} onClick={() => onNavigate(link.key)}><Icon size={14} />{link.label}</button>; })}</nav>
      <button className="projects-app-home" onClick={() => onNavigate("overview")}><LayoutDashboard size={14} /> Exit workspace</button>
    </header>
    <div className="projects-app-content">{children}</div>
  </section>;
}
