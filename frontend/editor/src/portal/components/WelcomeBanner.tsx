import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import { EDITOR_URL } from "@portal/auth/editorUrl";
import { EditorIcon, ExternalLinkIcon } from "@portal/components/icons";
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

  return (
    <section
      className="portal-welcome"
      aria-label={t("portal.welcome.ariaLabel")}
    >
      <div className="portal-welcome__header">
        <div className="portal-welcome__brand">
          <span className="portal-welcome__mark" aria-hidden>
            <EditorIcon size={20} />
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
        <Button
          variant="primary"
          leftSection={<ExternalLinkIcon size={15} />}
          onClick={() => {
            window.location.href = EDITOR_URL;
          }}
        >
          {t("portal.welcome.openInBrowser")}
        </Button>
      </div>

      {footer && <div className="portal-welcome__footer">{footer}</div>}
    </section>
  );
}
