import { Button } from "@shared/components/Button";
import { useTranslation } from "@app/hooks/useTranslation";
import "@shared/auth/ui/auth.css";
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
        <Button
          variant="tertiary"
          onClick={() => {
            setShowMagicLink(true);
          }}
          disabled={isSubmitting}
          className="auth-toggle-link"
        >
          {t("login.useMagicLink")}
        </Button>
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
      <Button
        onClick={onSubmit}
        disabled={isSubmitting || !magicLinkEmail}
        className="auth-magic-button"
      >
        {isSubmitting ? t("login.sending") : t("login.sendMagicLink")}
      </Button>
    </div>
  );
}
