import type { ReactNode } from "react";
import { Logo } from "@app/ui/Logo";
import styles from "@app/components/shared/setupCard/SetupCard.module.css";

interface SetupCardLayoutProps {
  title: ReactNode;
  subtitle: ReactNode;
  children: ReactNode;
}

/** Header and body of a step in a centred setup card (AuthShell). */
export function SetupCardLayout({
  title,
  subtitle,
  children,
}: SetupCardLayoutProps) {
  return (
    <>
      <header className={styles.header}>
        <Logo variant="iconOnly" iconHeight="2.5rem" />
        <div className={styles.headerText}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
      </header>
      <div className={styles.body}>{children}</div>
    </>
  );
}
