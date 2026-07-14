import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import { useView } from "@portal/contexts/ViewContext";
import { EDITOR_URL } from "@portal/auth/editorUrl";
import {
  DownloadIcon,
  ExternalLinkIcon,
  UserPlusIcon,
} from "@portal/components/icons";
import { DownloadEditorModal } from "@portal/components/DownloadEditorModal";
import markDark from "@app/assets/brand/modern-logo/StirlingPDFLogoNoTextDark.svg";
import "@portal/components/WelcomeBanner.css";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Free-tier welcome hero                                                   */
/*                                                                           */
/*  A compact product header — brand mark, "PDF Editor" + social-proof       */
/*  stats, and a single "Open in browser" CTA — over the getting-started      */
/*  steps (passed in as {@code footer}). Deliberately lean: the onboarding    */
/*  steps, not marketing copy, are the point of the card.                    */
/* ──────────────────────────────────────────────────────────────────────── */

interface WelcomeBannerProps {
  /**
   * The getting-started steps + enterprise rung, rendered inside the card
   * below the header. Kept as a slot so the hero stays a presentational shell.
   */
  footer?: ReactNode;
}

export function WelcomeBanner({ footer }: WelcomeBannerProps) {
  const { t } = useTranslation();
  const { setActiveView } = useView();
  const [installOpen, setInstallOpen] = useState(false);

  return (
    <section
      className="portal-welcome"
      aria-label={t("portal.welcome.ariaLabel")}
    >
      <div className="portal-welcome__header">
        <div className="portal-welcome__brand">
          <span className="portal-welcome__mark" aria-hidden>
            <img src={markDark} alt="" />
          </span>
          <div className="portal-welcome__brand-text">
            <span className="portal-welcome__product">
              {t("portal.welcome.productName")}
            </span>
            <span className="portal-welcome__stats">
              {t("portal.welcome.stats")}
            </span>
          </div>
        </div>
        <div className="portal-welcome__actions">
          <button
            type="button"
            className="portal-welcome__icon-btn"
            onClick={() => setActiveView("users")}
            aria-label={t("portal.welcome.invite")}
            title={t("portal.welcome.invite")}
          >
            <UserPlusIcon size={16} />
          </button>
          <button
            type="button"
            className="portal-welcome__icon-btn"
            onClick={() => setInstallOpen(true)}
            aria-label={t("portal.welcome.install")}
            title={t("portal.welcome.install")}
          >
            <DownloadIcon size={16} />
          </button>
          <Button
            variant="primary"
            className="portal-welcome__cta"
            leftSection={<ExternalLinkIcon size={15} />}
            onClick={() => {
              window.location.href = EDITOR_URL;
            }}
          >
            {t("portal.welcome.openInBrowser")}
          </Button>
        </div>
      </div>

      {footer && <div className="portal-welcome__footer">{footer}</div>}

      <DownloadEditorModal
        open={installOpen}
        onClose={() => setInstallOpen(false)}
      />
    </section>
  );
}
