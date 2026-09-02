import type { ReactNode } from "react";
import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Skeleton } from "@app/ui";
import { useTier } from "@processor/contexts/TierContext";
import { EDITOR_URL } from "@processor/auth/editorUrl";
import {
  useEditorDeployment,
  useFleetStats,
} from "@processor/queries/infrastructure";
import { type EditorInstance } from "@processor/api/editorDeploy";
import { DownloadEditorModal } from "@processor/components/DownloadEditorModal";
import "@processor/theme/surface.css";
import { BrandTile } from "@app/components/shared/BrandTile";
import "@processor/components/EditorStatusCard.css";

/** The instance to headline: the busiest healthy one, else the first. */
function primaryInstance(instances: EditorInstance[]): EditorInstance | null {
  if (instances.length === 0) return null;
  const healthy = instances.filter((i) => i.status === "healthy");
  const pool = healthy.length > 0 ? healthy : instances;
  return pool.reduce((best, i) =>
    i.activeUsers > best.activeUsers ? i : best,
  );
}

/**
 * The rail's primary action matures with adoption rather than deployment alone (marketing note
 * D243): the loud ask only stands while the org is still one person on an undeployed editor. Once
 * a deployment is in flight, finishing it takes over; once teammates are in, the ask goes quiet.
 */
type DeployAsk = "finish" | "start" | "options";

function deployAsk(
  instances: EditorInstance[],
  activeUsers: number,
): DeployAsk {
  const deployed = instances.some((i) => i.status === "healthy");
  if (!deployed && instances.some((i) => i.status === "pairing"))
    return "finish";
  if (!deployed && activeUsers <= 1) return "start";
  return "options";
}

interface EditorStatusCardProps {
  /** Attached footer strip inside the card — the deal-status hero while a deal is underway. */
  footer?: ReactNode;
}

/**
 * The Home hero: the deployment rail for the org's PDF Editor. Host and build meta come from the
 * same `/v1/editor/deployment` data as the Editor admin view, headlining the busiest instance; the
 * adoption count is the figure Usage & Billing reports. The rail always renders — it carries the
 * deploy ask itself — and each figure stands down independently when its source can't supply it.
 */
export function EditorStatusCard({ footer }: EditorStatusCardProps) {
  const { t } = useTranslation();
  const { tier } = useTier();
  const [installOpen, setInstallOpen] = useState(false);
  const { data, loading } = useEditorDeployment(tier);
  // The adoption figure is the same one Usage & Billing reports, read through the shared cache so
  // the two agree and only one request is made. Either field is null when the backend can't compute
  // it (e.g. EE auditing off), in which case the rail states no figure rather than a misleading 0.
  const { data: fleet } = useFleetStats();
  const adoption =
    fleet?.activeThisMonth != null && fleet.editorsDeployed != null
      ? { active: fleet.activeThisMonth, total: fleet.editorsDeployed }
      : null;

  const view = useMemo(() => {
    if (!data) return null;
    const activeUsers = data.instances.reduce((s, i) => s + i.activeUsers, 0);
    const ask = deployAsk(data.instances, activeUsers);
    const primary = primaryInstance(data.instances);
    // Nothing deployed yet: the rail still shows, carrying the deploy ask. Only the host and
    // build meta are instance-derived, so they simply stand down.
    if (!primary) {
      return { host: null, activeUsers, ask, meta: [] as string[] };
    }
    const targetLabel = t(`processor.home.editor.target.${primary.target}`);
    return {
      host: primary.host,
      activeUsers,
      ask,
      workspaceUrl: data.summary.workspaceUrl,
      meta: [
        // Skip the deployment label when it just repeats the host (e.g. the
        // managed-cloud instance is literally named "Managed Cloud").
        primary.host === targetLabel ? null : targetLabel,
        primary.region,
        `v${primary.version}`,
        t("processor.home.editor.updated", { time: primary.lastSeen }),
      ].filter(Boolean) as string[],
    };
  }, [data, t]);

  // Only the deploy ask can go loud; unknown deployment state keeps it quiet.
  const loudAsk = !!view && view.ask !== "options";

  return (
    <section
      className="processor-surface processor-editor-hero"
      aria-label={t("processor.home.editor.name")}
    >
      <div className="processor-editor-hero__row">
        <div className="processor-editor-hero__logo">
          <BrandTile className="processor-editor-hero__mark" />
        </div>

        <div className="processor-editor-hero__info">
          {/* Each figure stands down on its own: the host and build meta need the deployment
              endpoint, the adoption count needs fleet stats. Neither absence blanks the rail, and
              nothing is asserted that its own source could not supply. */}
          {loading ? (
            <>
              <Skeleton width="12rem" height="1.25rem" />
              <Skeleton width="22rem" height="0.75rem" />
            </>
          ) : (
            <>
              <div className="processor-editor-hero__title-row">
                <span className="processor-editor-hero__name">
                  {t("processor.home.editor.name")}
                </span>
                {view?.host && (
                  <span className="processor-editor-hero__host">
                    {view.host}
                  </span>
                )}
                {adoption && (
                  <>
                    <span className="processor-editor-hero__dot" aria-hidden />
                    <span className="processor-editor-hero__actives">
                      {t("processor.home.editor.activeOfDeployed", adoption)}
                    </span>
                  </>
                )}
              </div>
              {view && view.meta.length > 0 && (
                <div className="processor-editor-hero__meta">
                  {view.meta.map((item, i) => (
                    <Fragment key={i}>
                      {i > 0 && (
                        <span className="processor-editor-hero__meta-sep">
                          ·
                        </span>
                      )}
                      <span>{item}</span>
                    </Fragment>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Open in browser is a left-seated secondary in every state, and carries no arrow
            (marketing note D244); the deploy ask beside it is the only button that can go loud.
            Reaching the editor never depends on deployment data — it falls back to the configured
            editor URL — so this stays live even when the deployment endpoint is unavailable. */}
        <div className="processor-editor-hero__action">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              window.open(
                view?.workspaceUrl || EDITOR_URL,
                "_blank",
                "noopener,noreferrer",
              );
            }}
          >
            {t("processor.home.editor.open")}
          </Button>
          <Button
            variant={loudAsk ? "primary" : "secondary"}
            accent={loudAsk ? "neutral" : "default"}
            size="sm"
            onClick={() => setInstallOpen(true)}
          >
            {t(`processor.home.editor.deploy.${view?.ask ?? "options"}`)}
          </Button>
        </div>
      </div>

      {footer && <div className="processor-editor-hero__footer">{footer}</div>}

      <DownloadEditorModal
        open={installOpen}
        onClose={() => setInstallOpen(false)}
      />
    </section>
  );
}
