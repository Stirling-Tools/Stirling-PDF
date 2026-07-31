import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import { Banner, EmptyState } from "@app/ui";
import "@portal/components/pipelines/PipelineInspector.css";

export interface PipelineInspectorProps {
  /** Names what is selected, e.g. the step's tool or "Input". Absent when nothing is. */
  title?: string;
  icon?: ReactNode;
  /**
   * Why the last test run failed on this step. Only ever set for the one step the run stopped at -
   * the run reports a single failing step, so no other node can claim the error.
   */
  error?: string | null;
  /**
   * Shown instead of any editor - for a selection with no single thing to configure, such as
   * several steps at once.
   */
  message?: string;
  /** The selected node's own editor. Absent when nothing is selected. */
  children?: ReactNode;
}

/**
 * The builder's right-hand panel: the settings of whatever node is selected, and nothing else.
 *
 * Deliberately node-scoped. The definition and a test run's produced files belong to the whole
 * pipeline, so they live with the other pipeline-scoped controls in the header - putting them in a
 * switch here implied they were scoped to the selected node, which they never were.
 */
export function PipelineInspector({
  title,
  icon,
  error,
  message,
  children,
}: PipelineInspectorProps) {
  const { t } = useTranslation();

  if (message) {
    return (
      <aside className="portal-inspector">
        <EmptyState
          size="compact"
          title={message}
          description={t("portal.pipelines.inspector.multipleBody")}
        />
      </aside>
    );
  }

  if (!children) {
    return (
      <aside className="portal-inspector">
        <EmptyState
          size="compact"
          title={t("portal.pipelines.inspector.noSelectionTitle")}
          description={t("portal.pipelines.inspector.noSelectionBody")}
        />
      </aside>
    );
  }

  return (
    <aside className="portal-inspector">
      <div className="portal-inspector__title">
        {icon ?? <TuneRoundedIcon style={{ fontSize: "1.125rem" }} />}
        <span>{title}</span>
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      {children}
    </aside>
  );
}
