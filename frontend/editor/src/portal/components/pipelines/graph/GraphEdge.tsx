import { useTranslation } from "react-i18next";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import { ActionIcon } from "@app/ui";
import type { LaidOutEdge } from "@portal/components/pipelines/graph/pipelineLayout";
import { useEdgeDrop } from "@portal/components/pipelines/graph/useChainDragDrop";
import "@portal/components/pipelines/graph/GraphEdge.css";

export interface GraphEdgeProps {
  edge: LaidOutEdge;
  /** Add a new step in the slot this wire opens. */
  onInsert: (index: number) => void;
  stepCount: number;
  /** Given the chain's new order as original step indices. */
  onReorder: (order: number[]) => void;
  /** A step is in flight, so open wires advertise themselves as landing spots. */
  dragActive: boolean;
  /**
   * Why what flows along this wire will not be much use to the node it arrives at (encrypting
   * before an OCR, say). Advisory only - the chain still runs and the order is still the user's
   * to choose.
   */
  warning?: string;
}

/**
 * One wire between two nodes: a directed line carrying an insert affordance, and the drop target
 * that catches a step dragged onto it. Where the pairing does not make sense the wire says so,
 * rather than refusing it.
 */
export function GraphEdge({
  edge,
  onInsert,
  stepCount,
  onReorder,
  dragActive,
  warning,
}: GraphEdgeProps) {
  const { t } = useTranslation();
  const { ref, over } = useEdgeDrop({
    insertIndex: edge.insertIndex,
    stepCount,
    onReorder,
  });
  const open = edge.insertIndex !== null;

  return (
    <div
      ref={ref}
      className={[
        "portal-graph-edge",
        open ? "" : "is-plain",
        dragActive && open ? "is-available" : "",
        over ? "is-over" : "",
        warning ? "has-warning" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        left: `${edge.x}px`,
        top: `${edge.y1}px`,
        height: `${edge.y2 - edge.y1}px`,
      }}
    >
      <span className="portal-graph-edge__line" aria-hidden />
      {warning ? (
        <span className="portal-graph-edge__warning" title={warning}>
          <WarningAmberRoundedIcon style={{ fontSize: "0.875rem" }} />
          <span className="portal-graph-edge__warning-label">{warning}</span>
        </span>
      ) : (
        open && (
          <ActionIcon
            variant="tertiary"
            size="sm"
            shape="circle"
            className="portal-graph-edge__insert"
            aria-label={t("portal.pipelines.graph.insertHere")}
            onClick={() => onInsert(edge.insertIndex as number)}
          >
            <AddRoundedIcon style={{ fontSize: "0.875rem" }} />
          </ActionIcon>
        )
      )}
    </div>
  );
}
