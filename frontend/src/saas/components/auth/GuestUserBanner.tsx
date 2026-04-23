import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import CloseIcon from "@mui/icons-material/Close";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import { useAuth } from "@app/auth/UseSession";
import { isUserAnonymous } from "@app/auth/supabase";
import { withBasePath } from "@app/constants/app";
import "@app/components/auth/GuestUserBanner.css";

interface GuestUserBannerProps {
  className?: string;
}

// Ensure the toast only appears once per full page load, not on re-hydration
let hasShownThisLoad = false;

/**
 * Guest user toast encouraging account creation.
 * Appears 2s after load, top-right of the viewport, offset by right rail.
 */
export function GuestUserBanner({ className = "" }: GuestUserBannerProps) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [isDismissed, setIsDismissed] = useState(false);
  const [visible, setVisible] = useState(false);

  const isAnon = Boolean(session?.user && isUserAnonymous(session.user));

  useEffect(() => {
    if (!isAnon || hasShownThisLoad) return;

    const timer = setTimeout(() => {
      setVisible(true);
      hasShownThisLoad = true;
    }, 2000);

    return () => clearTimeout(timer);
  }, [isAnon]);

  if (!isAnon || isDismissed || !visible) {
    return null;
  }

  const handleSignUp = () => {
    window.location.href = withBasePath("/signup");
  };

  const handleDismiss = () => {
    setIsDismissed(true);
  };

  return (
    <div
      className={`guest-banner ${className || ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="guest-banner-content">
        <div className="guest-banner-text">
          <div className="guest-banner-title">
            {t("guestBanner.title", "You're using Stirling PDF as a guest!")}
          </div>
          <div className="guest-banner-message">
            {t(
              "guestBanner.message",
              "Create a free account to save your work, access more features, and support the project.",
            )}
          </div>
        </div>
        <div className="guest-banner-actions">
          <button
            onClick={handleDismiss}
            aria-label={t("guestBanner.dismiss", "Dismiss banner")}
            className="guest-banner-dismiss"
          >
            <CloseIcon className="guest-banner-icon" />
          </button>
          <button onClick={handleSignUp} className="guest-banner-signup">
            <PersonAddIcon className="guest-banner-signup-icon" />
            {t("guestBanner.signUp", "Sign Up Free")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default GuestUserBanner;
