import type { ReactNode } from "react";
import "@app/components/settings/AccountConnectionLayout.css";

/** Shared settings surface for an instance's account connection and its team's instance list. */
export function AccountConnectionLayout({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="account-connection">
      <header className="account-connection__header">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {actions}
      </header>
      <div className="account-connection__sheet">{children}</div>
    </div>
  );
}
