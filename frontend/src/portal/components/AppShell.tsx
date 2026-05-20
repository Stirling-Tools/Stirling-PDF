import type { ReactNode } from "react";
import { Sidebar } from "@app/components/Sidebar";
import { Header } from "@app/components/Header";
import "@app/components/AppShell.css";

/**
 * Two-column layout: fixed-width sidebar on the left, sticky header + scrolling
 * main column on the right. The Sidebar and Header read their state from
 * context, so this shell stays prop-free.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="portal-shell">
      <Sidebar />
      <div className="portal-shell__main">
        <Header />
        <main className="portal-shell__view">{children}</main>
      </div>
    </div>
  );
}
