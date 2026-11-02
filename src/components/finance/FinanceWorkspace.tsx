import type { ReactNode } from "react";
import { ArrowLeftRight, ChartNoAxesCombined, LayoutDashboard } from "lucide-react";
import "./finance-workspace.css";

const links = [
  { key: "finance_dashboard", label: "Overview" },
  { key: "transactions", label: "Transactions" },
  { key: "transaction_categories", label: "Categories" },
  { key: "budgets", label: "Budgets" },
  { key: "savings_goals", label: "Savings goals" },
  { key: "savings_contributions", label: "Contributions" },
  { key: "loans", label: "Borrowed & lent" },
  { key: "financial_accounts", label: "Accounts" },
  { key: "recurring_transactions", label: "Recurring" },
];

export function FinanceWorkspace({ activePage, onNavigate, children }: {
  activePage: string;
  onNavigate: (key: string) => void;
  children: ReactNode;
}) {
  return <section className="workspace-app finance-app">
    <aside className="finance-app-rail">
      <div className="finance-app-brand"><img className="workspace-brand-mark" src="/icons/lifeos-mark.png" alt="" /><div><small>FINANCE DESK</small><b>Money, organized</b></div></div>
      <p className="finance-app-caption">YOUR MONEY</p>
      <nav aria-label="Finance workspace">{links.map((link) => <button key={link.key} className={activePage === link.key ? "selected" : ""} aria-current={activePage === link.key ? "page" : undefined} onClick={() => onNavigate(link.key)}>
        {link.key === "transactions" ? <ArrowLeftRight size={14} /> : link.key === "finance_dashboard" ? <ChartNoAxesCombined size={14} /> : <span className="finance-nav-dot" />}<span>{link.label}</span>
      </button>)}</nav>
      <button className="finance-app-home" onClick={() => onNavigate("overview")}><LayoutDashboard size={14} /> All of LifeOS</button>
    </aside>
    <div className="finance-app-content">{children}</div>
  </section>;
}
