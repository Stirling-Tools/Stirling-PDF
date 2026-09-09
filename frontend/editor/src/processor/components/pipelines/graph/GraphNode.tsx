import type { MouseEvent, ReactNode, Ref } from "react";
import { useTranslation } from "react-i18next";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import MoveToInboxRoundedIcon from "@mui/icons-material/MoveToInboxRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import { ActionIcon, NodeCard } from "@app/ui";
import { type IconBadgeAccent } from "@app/ui/IconBadge";
import type { GraphNodeKind } from "@processor/components/pipelines/graph/pipelineLayout";
import "@processor/components/pipelines/graph/GraphNode.css";

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
  onOpenRunState?: () => void;
  onSelect: (event: MouseEvent) => void;
  /** Takes the node off the chain. For an end, that returns its row to a placeholder. */
  onRemove?: () => void;
  /** True while this node is being dragged to another place in the chain. */
  dragging?: boolean;
  /**
   * The step's place in the chain, so a multi-step drag preview can find the other selected cards
   * in the DOM. Absent for the input and output, which are never dragged.
   */
  stepIndex?: number;
  /** The card element, for the drag adapter to register against. */
  ref?: Ref<HTMLDivElement>;
}

/**
 * One node in the pipeline graph: the shared {@link NodeCard} tile carrying its glyph, title and a
 * one-line summary, plus the graph-only extras layered on top - run status, a remove control, drag
 * dimming, and the "why this cannot be saved" warning line. Position is applied by the graph, so the
 * node itself knows nothing about layout.
 */
export function GraphNode({
  kind,
  title,
  detail,
  warning,
  icon,
  selected,
  runState,
  onOpenRunState,
  onSelect,
  onRemove,
  dragging,
  stepIndex,
  ref,
}: GraphNodeProps) {
  const { t } = useTranslation();

  const runStatus = runState && (
    <RunStatus
      runState={runState}
      title={title}
      onOpenRunState={onOpenRunState}
    />
  );
  const remove = onRemove && (
    <ActionIcon
      variant="tertiary"
      size="sm"
      shape="circle"
      className="processor-graph-node__remove"
      aria-label={t("processor.pipelines.graph.removeNode", { name: title })}
      onClick={onRemove}
    >
      <CloseRoundedIcon style={{ fontSize: "0.875rem" }} />
    </ActionIcon>
  );

  return (
    <NodeCard
      ref={ref}
      data-graph-node={kind}
      data-step-index={stepIndex}
      className={[
        "processor-graph-node",
        `processor-graph-node--${kind}`,
        dragging ? "is-dragging" : "",
        runState ? `is-${runState}` : "",
      ]
        .filter(Boolean)
        .join(" ")}
      icon={icon ?? KIND_ICON[kind]}
      iconAccent={KIND_ACCENT[kind]}
      title={title}
      tone={warning ? "warning" : "default"}
      selected={selected}
      onSelect={onSelect}
      detail={
        warning ? (
          <span className="processor-graph-node__warning">
            <WarningAmberRoundedIcon style={{ fontSize: "0.875rem" }} />
            {warning}
          </span>
        ) : (
          detail
        )
      }
      trailing={
        <>
          {runStatus}
          {remove}
        </>
      }
    />
  );
}

interface RunStatusProps {
  runState: NodeRunState;
  title: string;
  onOpenRunState?: () => void;
}

/** The run glyph on the card's trailing edge; a button when it opens a failure, else a status. */
function RunStatus({ runState, title, onOpenRunState }: RunStatusProps) {
  const { t } = useTranslation();
  if (runState === "failed" && onOpenRunState) {
    return (
      <ActionIcon
        variant="tertiary"
        size="sm"
        shape="circle"
        className="processor-graph-node__run processor-graph-node__run--open"
        aria-label={t("processor.pipelines.graph.showError", { name: title })}
        onClick={onOpenRunState}
      >
        <ErrorOutlineRoundedIcon style={{ fontSize: "1.125rem" }} />
      </ActionIcon>
    );
  }
  return (
    <span className="processor-graph-node__run" role="status">
      {runState === "running" && (
        <span className="processor-graph-node__pulse" aria-hidden />
      )}
      {runState === "done" && (
        <CheckRoundedIcon style={{ fontSize: "1.125rem" }} />
      )}
      {runState === "failed" && (
        <ErrorOutlineRoundedIcon style={{ fontSize: "1.125rem" }} />
      )}
      <span className="processor-graph-node__run-label">
        {t(`processor.pipelines.graph.run.${runState}`)}
      </span>
    </span>
  );
}
