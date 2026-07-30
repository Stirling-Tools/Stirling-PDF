import type { ReactNode, Ref } from "react";
import { useTranslation } from "react-i18next";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import MoveToInboxRoundedIcon from "@mui/icons-material/MoveToInboxRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import { ActionIcon, Button } from "@app/ui";
import { IconBadge, type IconBadgeAccent } from "@app/ui/IconBadge";
import type { GraphNodeKind } from "@portal/components/pipelines/graph/pipelineLayout";
import "@portal/components/pipelines/graph/GraphNode.css";

/** How a node is faring in the current or last test run. */
export type NodeRunState = "running" | "done" | "failed";

/** The kinds this card renders. The placeholder is its own component, not a node variant. */
type CardKind = Exclude<GraphNodeKind, "placeholder">;

const KIND_ICON: Record<CardKind, ReactNode> = {
  input: <MoveToInboxRoundedIcon style={{ fontSize: "1.125rem" }} />,
  step: <TuneRoundedIcon style={{ fontSize: "1.125rem" }} />,
  output: <SendRoundedIcon style={{ fontSize: "1.125rem" }} />,
};

const KIND_ACCENT: Record<CardKind, IconBadgeAccent> = {
  input: "green",
  step: "blue",
  output: "purple",
};

export interface GraphNodeProps {
  kind: CardKind;
  title: string;
  /** One-line summary under the title (the source's path, a step's parameters). */
  detail?: string;
  /**
   * Problem with this node's configuration, shown in place of the detail. Distinct from a run
   * failure: this is why the pipeline cannot be saved yet.
   */
  warning?: string;
  /** The step's own tool glyph; falls back to a per-kind default. */
  icon?: ReactNode;
  selected: boolean;
  runState?: NodeRunState;
  onSelect: () => void;
  /** Steps only - the input and output nodes are part of every pipeline and cannot be removed. */
  onRemove?: () => void;
  /** True while this node is being dragged to another place in the chain. */
  dragging?: boolean;
  /** The card element, for the drag adapter to register against. */
  ref?: Ref<HTMLDivElement>;
}

/**
 * One node in the pipeline graph: a card carrying its glyph, title and a one-line summary.
 *
 * The whole card is the select target, with delete as a separate sibling button rather than a
 * nested one (nested interactive elements are invalid and unreachable by keyboard). Position is
 * applied by the graph, so the node itself knows nothing about layout.
 */
export function GraphNode({
  kind,
  title,
  detail,
  warning,
  icon,
  selected,
  runState,
  onSelect,
  onRemove,
  dragging,
  ref,
}: GraphNodeProps) {
  const { t } = useTranslation();
  const className = [
    "portal-graph-node",
    `portal-graph-node--${kind}`,
    selected ? "is-selected" : "",
    dragging ? "is-dragging" : "",
    warning ? "has-warning" : "",
    runState ? `is-${runState}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className} ref={ref} data-graph-node={kind}>
      <Button
        variant="quiet"
        className="portal-graph-node__select"
        aria-pressed={selected}
        onClick={onSelect}
      >
        <IconBadge accent={KIND_ACCENT[kind]} size="sm">
          {icon ?? KIND_ICON[kind]}
        </IconBadge>
        <span className="portal-graph-node__text">
          <span className="portal-graph-node__title">{title}</span>
          {warning ? (
            <span className="portal-graph-node__warning">
              <WarningAmberRoundedIcon style={{ fontSize: "0.875rem" }} />
              {warning}
            </span>
          ) : (
            detail && (
              <span className="portal-graph-node__detail">{detail}</span>
            )
          )}
        </span>
      </Button>

      {runState && (
        <span className="portal-graph-node__run" role="status">
          {runState === "running" && (
            <span className="portal-graph-node__pulse" aria-hidden />
          )}
          {runState === "done" && (
            <CheckRoundedIcon style={{ fontSize: "1.125rem" }} />
          )}
          {runState === "failed" && (
            <ErrorOutlineRoundedIcon style={{ fontSize: "1.125rem" }} />
          )}
          <span className="portal-graph-node__run-label">
            {t(`portal.pipelines.graph.run.${runState}`)}
          </span>
        </span>
      )}

      {onRemove && (
        <ActionIcon
          variant="tertiary"
          size="sm"
          shape="circle"
          className="portal-graph-node__remove"
          aria-label={t("portal.pipelines.graph.removeNode", { name: title })}
          onClick={onRemove}
        >
          <CloseRoundedIcon style={{ fontSize: "0.875rem" }} />
        </ActionIcon>
      )}
    </div>
  );
}
