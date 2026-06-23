import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "@shared/auth/ui/AuthShell.module.css";

export interface AuthShellProps {
  children: ReactNode;
  /** Optional panel shown beside the form on wide/tall viewports (the carousel). */
  rightPanel?: ReactNode;
  /** Optional fixed footer slot (the editor passes its legal/cookie footer). */
  footer?: ReactNode;
}

/**
 * The login card shell shared by the editor and the portal: a centered card
 * that expands to two columns (form + right panel) on wide/tall viewports and
 * collapses to a single column otherwise. Purely presentational - callers
 * provide the form (children), the right panel, and an optional footer.
 */
export function AuthShell({ children, rightPanel, footer }: AuthShellProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [hideRightPanel, setHideRightPanel] = useState(false);

  useEffect(() => {
    const update = () => {
      // Use viewport to avoid hysteresis when the card is already single-column.
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const cardWidthIfTwoCols = Math.min(1180, viewportWidth * 0.96); // min(73.75rem, 96vw)
      const columnWidth = cardWidthIfTwoCols / 2;
      const tooNarrow = columnWidth < 470;
      const tooShort = viewportHeight < 740;
      setHideRightPanel(tooNarrow || tooShort);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  const showRightPanel = Boolean(rightPanel) && !hideRightPanel;

  return (
    <div className={styles.authContainer}>
      <div
        ref={cardRef}
        className={`${styles.authCard} ${showRightPanel ? styles.authCardTwoColumns : ""}`}
      >
        <div className={styles.authLeftPanel}>
          <div className={styles.authContent}>{children}</div>
        </div>
        {showRightPanel && rightPanel}
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
