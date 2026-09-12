import type { ReactNode } from "react";
import "@app/components/settings/AccountConnectionLayout.css";

/** Shared settings surface for an instance's account connection and its team's instance list. */
export function AccountConnectionLayout({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="account-connection">
      <header className="account-connection__header">
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      <div className="account-connection__sheet">{children}</div>
    </div>
  );
}
