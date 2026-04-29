import { useTranslation } from "@app/hooks/useTranslation";
import "@app/routes/authShared/auth.css";
import "@app/routes/authShared/saas-auth.css";

interface MagicLinkFormProps {
  showMagicLink: boolean;
  magicLinkEmail: string;
  setMagicLinkEmail: (email: string) => void;
  setShowMagicLink: (show: boolean) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

export default function MagicLinkForm({
  showMagicLink,
  magicLinkEmail,
  setMagicLinkEmail,
  setShowMagicLink,
  onSubmit,
  isSubmitting,
}: MagicLinkFormProps) {
  const { t } = useTranslation();

  if (!showMagicLink) {
    return (
      <div className="auth-toggle-wrapper">
        <button
          onClick={() => {
            setShowMagicLink(true);
          }}
          disabled={isSubmitting}
          className="auth-toggle-link"
        >
          {t("login.useMagicLink")}
        </button>
      </div>
    );
  }

  return (
    <div className="auth-magic-row">
      <input
        type="email"
        placeholder={t("login.enterEmailForMagicLink")}
        value={magicLinkEmail}
        onChange={(e) => setMagicLinkEmail(e.target.value)}
        onKeyPress={(e) => e.key === "Enter" && !isSubmitting && onSubmit()}
        className="auth-input"
      />
      <button
        onClick={onSubmit}
        disabled={isSubmitting || !magicLinkEmail}
        className="auth-magic-button"
      >
        {isSubmitting ? t("login.sending") : t("login.sendMagicLink")}
      </button>
    </div>
  );
}
