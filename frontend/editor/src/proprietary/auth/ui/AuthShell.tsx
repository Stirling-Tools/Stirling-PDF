import type { ReactNode } from "react";
import styles from "@app/auth/ui/AuthShell.module.css";

export interface AuthShellProps {
  children: ReactNode;
  /** Optional fixed footer slot (the editor passes its legal/cookie footer). */
  footer?: ReactNode;
  /** `wide` fits content with code samples or side-by-side rows. Default `narrow`. */
  size?: "narrow" | "wide";
}

/**
 * The login card shell shared by the editor and the portal: a single narrow
 * card centered on the screen. Purely presentational - callers provide the
 * form (children) and an optional footer.
 */
export function AuthShell({
  children,
  footer,
  size = "narrow",
}: AuthShellProps) {
  return (
    <div className={styles.authContainer}>
      <div
        className={[styles.authCard, size === "wide" ? styles.authCardWide : ""]
          .filter(Boolean)
          .join(" ")}
      >
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
