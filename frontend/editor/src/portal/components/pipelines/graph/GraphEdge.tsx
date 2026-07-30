import { useTranslation } from "react-i18next";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { ActionIcon } from "@app/ui";
import type { LaidOutEdge } from "@portal/components/pipelines/graph/pipelineLayout";
import { useEdgeDrop } from "@portal/components/pipelines/graph/useChainDragDrop";
import "@portal/components/pipelines/graph/GraphEdge.css";

export interface GraphEdgeProps {
  edge: LaidOutEdge;
  /** Add a new step in the slot this wire opens. */
  onInsert: (index: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  /** A step is in flight, so open wires advertise themselves as landing spots. */
  dragActive: boolean;
}

/**
 * One wire between two nodes: a directed line carrying an insert affordance, and the drop target
 * that catches a step dragged onto it. A wire below a step that must stay last opens no slot, so it
 * renders as a plain line - no plus, no drop.
 */
export function GraphEdge({
  edge,
  onInsert,
  onReorder,
  dragActive,
}: GraphEdgeProps) {
  const { t } = useTranslation();
  const { ref, over } = useEdgeDrop({
    insertIndex: edge.insertIndex,
    onReorder,
  });
  const open = edge.insertIndex !== null;

  return (
    <div
      ref={ref}
      className={[
        "portal-graph-edge",
        open ? "" : "is-closed",
        dragActive && open ? "is-available" : "",
        over ? "is-over" : "",
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
      {open && (
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
      )}
    </div>
  );
}
