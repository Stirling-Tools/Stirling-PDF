import type { ReactNode } from "react";
import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Skeleton } from "@app/ui";
import { useTier } from "@portal/contexts/TierContext";
import { useView } from "@portal/contexts/ViewContext";
import { useEditorDeployment } from "@portal/queries/infrastructure";
import { type EditorInstance } from "@portal/api/editorDeploy";
import {
  DownloadIcon,
  ExternalLinkIcon,
  UsersIcon,
  UserPlusIcon,
} from "@portal/components/icons";
import { DownloadEditorModal } from "@portal/components/DownloadEditorModal";
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
      <rect width="256" height="256" rx="58" fill="var(--c-brand-mark)" />
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

/** The instance to headline: the busiest healthy one, else the first. */
function primaryInstance(instances: EditorInstance[]): EditorInstance | null {
  if (instances.length === 0) return null;
  const healthy = instances.filter((i) => i.status === "healthy");
  const pool = healthy.length > 0 ? healthy : instances;
  return pool.reduce((best, i) =>
    i.activeUsers > best.activeUsers ? i : best,
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
 * Subscribed/enterprise home hero: a status card for the org's deployed PDF
 * Editor. Reads the same `/v1/editor/deployment` data as the Editor admin view
 * (host, version, live users, deployment shape) and headlines the busiest
 * instance, with a single "Open in browser" action to the workspace URL.
 */
export function EditorStatusCard({ footer, hideChips }: EditorStatusCardProps) {
  const { t } = useTranslation();
  const { tier } = useTier();
  const { setActiveView } = useView();
  const [installOpen, setInstallOpen] = useState(false);
  const { data, loading } = useEditorDeployment(tier);

  const view = useMemo(() => {
    if (!data) return null;
    const primary = primaryInstance(data.instances);
    if (!primary) return null;
    const activeUsers = data.instances.reduce((s, i) => s + i.activeUsers, 0);
    const targetLabel = t(`portal.home.editor.target.${primary.target}`);
    return {
      host: primary.host,
      activeUsers,
      workspaceUrl: data.summary.workspaceUrl,
      meta: [
        // Skip the deployment label when it just repeats the host (e.g. the
        // managed-cloud instance is literally named "Managed Cloud").
        primary.host === targetLabel ? null : targetLabel,
        primary.region,
        `v${primary.version}`,
        t("portal.home.editor.updated", { time: primary.lastSeen }),
      ].filter(Boolean) as string[],
    };
  }, [data, t]);

  const ready = !loading && !!view;
  // The editor-deployment endpoint isn't implemented on every backend yet.
  // When it's unavailable (finished loading with no data — e.g. a 404), skip
  // the status row entirely and fall back to just the footer (the setup
  // checklist, which reads supported endpoints). It lights up automatically
  // once the backend serves /v1/editor/deployment.
  const unavailable = !loading && !view;

  if (unavailable) {
    return footer ? (
      <section className="portal-editor-hero portal-editor-hero--footer-only">
        {footer}
      </section>
    ) : null;
  }

  return (
    <section
      className="portal-editor-hero"
      aria-label={t("portal.home.editor.name")}
    >
      <div className="portal-editor-hero__row">
        <div className="portal-editor-hero__logo">
          <StirlingMark />
        </div>

        <div className="portal-editor-hero__info">
          {!ready || !view ? (
            <>
              <Skeleton width="12rem" height="1.25rem" />
              <Skeleton width="22rem" height="0.75rem" />
            </>
          ) : (
            <>
              <div className="portal-editor-hero__title-row">
                <span className="portal-editor-hero__name">
                  {t("portal.home.editor.name")}
                </span>
                {!hideChips && (
                  <button
                    type="button"
                    className="portal-editor-hero__chip"
                    onClick={() => setActiveView("users")}
                  >
                    <UsersIcon size={13} />
                    {t("portal.home.editor.activeUsers", {
                      n: view.activeUsers,
                    })}
                  </button>
                )}
              </div>
              <div className="portal-editor-hero__meta">
                <span className="portal-editor-hero__host">{view.host}</span>
                {view.meta.map((item, i) => (
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
          {!hideChips && (
            <button
              type="button"
              className="portal-editor-hero__icon-btn"
              onClick={() => setActiveView("users")}
              aria-label={t("portal.home.editor.invite")}
              title={t("portal.home.editor.invite")}
            >
              <UserPlusIcon size={16} />
            </button>
          )}
          <button
            type="button"
            className="portal-editor-hero__icon-btn"
            onClick={() => setInstallOpen(true)}
            aria-label={t("portal.home.editor.install")}
            title={t("portal.home.editor.install")}
          >
            <DownloadIcon size={16} />
          </button>
          <Button
            variant="primary"
            className="portal-editor-hero__cta"
            leftSection={<ExternalLinkIcon size={13} />}
            disabled={!ready || !view}
            onClick={() => {
              if (view)
                window.open(view.workspaceUrl, "_blank", "noopener,noreferrer");
            }}
          >
            {t("portal.home.editor.open")}
          </Button>
        </div>
      </div>

      {footer && <div className="portal-editor-hero__footer">{footer}</div>}

      <DownloadEditorModal
        open={installOpen}
        onClose={() => setInstallOpen(false)}
      />
    </section>
  );
}
