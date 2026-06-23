import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import LoginRightCarousel from "@shared/auth/ui/LoginRightCarousel";
import buildLoginSlides from "@app/components/shared/loginSlides";
import styles from "@app/routes/authShared/AuthLayout.module.css";
import { useLogoVariant } from "@app/hooks/useLogoVariant";
import { useIsOverflowing } from "@app/hooks/useIsOverflowing";
import Footer from "@app/components/shared/Footer";

interface AuthLayoutProps {
  children: React.ReactNode;
  isEmailFormExpanded?: boolean;
}

export default function AuthLayout({
  children,
  isEmailFormExpanded = false,
}: AuthLayoutProps) {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const leftPanelRef = useRef<HTMLDivElement | null>(null);
  const [hideRightPanel, setHideRightPanel] = useState(false);
  const logoVariant = useLogoVariant();
  const imageSlides = useMemo(
    () => buildLoginSlides(logoVariant, t),
    [logoVariant, t],
  );
  const isOverflowing = useIsOverflowing(leftPanelRef);

  // Use either overflow detection or email form expansion to determine scrollable state
  const shouldBeScrollable = isOverflowing || isEmailFormExpanded;

  useEffect(() => {
    const update = () => {
      // Use viewport to avoid hysteresis when the card is already in single-column mode
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const cardWidthIfTwoCols = Math.min(1180, viewportWidth * 0.96); // matches min(73.75rem, 96vw)
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

  return (
    <div className={styles.authContainer}>
      <div className={styles.authMain}>
        <div
          ref={cardRef}
          className={`${styles.authCard} ${!hideRightPanel ? styles.authCardTwoColumns : ""}`}
        >
          <div
            ref={leftPanelRef}
            className={`${styles.authLeftPanel} ${shouldBeScrollable ? styles.authLeftPanelScrollable : styles.authLeftPanelCentered}`}
          >
            <div className={styles.authContent}>{children}</div>
          </div>
          {!hideRightPanel && (
            <LoginRightCarousel
              imageSlides={imageSlides}
              initialSeconds={5}
              slideSeconds={8}
            />
          )}
        </div>
      </div>
      <div
        style={{
          width: "100vw",
          marginTop: "auto",
          marginLeft: "-1.5rem",
          marginRight: "-1.5rem",
        }}
      >
        <Footer analyticsEnabled />
      </div>
    </div>
  );
}
