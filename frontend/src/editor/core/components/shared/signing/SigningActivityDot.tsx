import { useTranslation } from "react-i18next";
import "@app/components/shared/signing/signing.css";

/** Unread activity indicator with the same accessible description in every signing entry point. */
export function SigningActivityDot({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const label = t(
    "signMenu.newActivity",
    "New activity since you last viewed this session",
  );
  return (
    <span
      className={`signing-activity-dot ${className}`}
      role="img"
      aria-label={label}
      title={label}
    />
  );
}
