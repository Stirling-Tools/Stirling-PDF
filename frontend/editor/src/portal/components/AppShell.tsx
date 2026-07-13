import type { ReactNode } from "react";
import { Sidebar } from "@portal/components/Sidebar";
import "@portal/components/AppShell.css";

/**
 * Two-column layout: fixed-width sidebar on the left, a scrolling main column on
 * the right. The Sidebar reads its state from context, so this shell stays
 * prop-free.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="portal-shell">
      <Sidebar />
      <div className="portal-shell__main">
        <main className="portal-shell__view">{children}</main>
      </div>
    </div>
  );
}
