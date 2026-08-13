import type { ReactNode } from "react";
import styles from "@app/auth/ui/AuthShell.module.css";

export interface AuthShellProps {
  children: ReactNode;
  /** Optional fixed footer slot (the editor passes its legal/cookie footer). */
  footer?: ReactNode;
}

/**
 * The login card shell shared by the editor and the portal: a single narrow
 * card centered on the screen. Purely presentational - callers provide the
 * form (children) and an optional footer.
 */
export function AuthShell({ children, footer }: AuthShellProps) {
  return (
    <div className={styles.authContainer}>
      {/* The card caps at 96vh and hides its scrollbar, so on a short viewport
          it scrolls with nothing to grab. Focusable so a keyboard can scroll
          it; the group role keeps it announced as one region rather than an
          unlabelled interactive element. */}
      <div className={styles.authCard} tabIndex={0} role="group">
        <div className={styles.authContent}>{children}</div>
      </div>
      {footer && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            width: "100%",
            zIndex: 10,
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}

export default AuthShell;
