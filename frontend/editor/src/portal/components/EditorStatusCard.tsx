import type { ReactNode } from "react";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Button, Skeleton } from "@app/ui";
import { useView } from "@portal/contexts/ViewContext";
import { useAsync } from "@portal/hooks/useAsync";
import { fetchEditorDeployment, type EditorDeployment } from "@portal/api/home";
import {
  ExternalLinkIcon,
  UsersIcon,
  UserPlusIcon,
} from "@portal/components/icons";
import "@portal/components/EditorStatusCard.css";

/** The Stirling brand mark, drawn at the hero size. Decorative. */
function StirlingMark() {
  return (
    <svg
      className="portal-editor-hero__mark"
      viewBox="0 0 256 256"
      fill="none"
      aria-hidden
    >
      <rect width="256" height="256" rx="58" fill="#8E3131" />
      <path
        d="M39.2638 127.834L155.374 32L155.375 121.499L39.2638 217.333L39.2638 127.834Z"
        fill="white"
      />
      <path
        d="M159 124.5L159 88.5L216.728 38.4472L216.728 128.052L100.479 224L100.479 172L159 124.5Z"
        fill="white"
        fillOpacity="0.6"
      />
    </svg>
  );
}

interface EditorStatusCardProps {
  /**
   * Rendered as an attached footer strip inside the card (e.g. the "Finish
   * setting up" checklist), matching the free-tier hero's footer seam.
   */
  footer?: ReactNode;
  /**
   * Hide the active-users / invite chips. Used on enterprise, where the
   * attached procurement deal hero already owns the invite action.
   */
  hideChips?: boolean;
}

/**
 * Subscribed-tier home hero: a status card for the deployed PDF Editor instance
 * — brand mark, active-user + invite chips, a deployment meta line, and a single
 * "Open in browser" action. Replaces the marketing welcome banner once an org is
 * paying and running its own instance.
 */
export function EditorStatusCard({ footer, hideChips }: EditorStatusCardProps) {
  const { t } = useTranslation();
  const { setActiveView } = useView();
  const { data, loading } = useAsync<EditorDeployment>(
    () => fetchEditorDeployment(),
    [],
  );

  return (
    <section className="portal-editor-hero" aria-label={data?.name}>
      <div className="portal-editor-hero__row">
        <div className="portal-editor-hero__logo">
          <StirlingMark />
        </div>

        <div className="portal-editor-hero__info">
          {loading || !data ? (
            <>
              <Skeleton width="12rem" height="1.25rem" />
              <Skeleton width="22rem" height="0.75rem" />
            </>
          ) : (
            <>
              <div className="portal-editor-hero__title-row">
                <span className="portal-editor-hero__name">{data.name}</span>
                {!hideChips && (
                  <>
                    <button
                      type="button"
                      className="portal-editor-hero__chip"
                      onClick={() => setActiveView("users")}
                    >
                      <UsersIcon size={13} />
                      {t("portal.home.editor.activeUsers", {
                        n: data.activeUsers,
                      })}
                    </button>
                    <button
                      type="button"
                      className="portal-editor-hero__chip"
                      onClick={() => setActiveView("users")}
                    >
                      <UserPlusIcon size={13} />
                      {t("portal.home.editor.invite")}
                    </button>
                  </>
                )}
              </div>
              <div className="portal-editor-hero__meta">
                <span className="portal-editor-hero__host">{data.host}</span>
                {data.meta.map((item, i) => (
                  <Fragment key={i}>
                    <span className="portal-editor-hero__meta-sep">·</span>
                    <span>{item}</span>
                  </Fragment>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="portal-editor-hero__action">
          <Button
            variant="gradient"
            leadingIcon={<ExternalLinkIcon size={13} />}
            disabled={loading || !data}
            onClick={() => {
              if (data)
                window.open(data.browserUrl, "_blank", "noopener,noreferrer");
            }}
          >
            {t("portal.home.editor.open")}
          </Button>
        </div>
      </div>

      {footer && <div className="portal-editor-hero__footer">{footer}</div>}
    </section>
  );
}
