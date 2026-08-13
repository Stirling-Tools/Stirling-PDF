import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  GraphNode,
  type NodeRunState,
} from "@portal/components/pipelines/graph/GraphNode";
import {
  GraphEdge,
  type ChainWarning,
} from "@portal/components/pipelines/graph/GraphEdge";
import { GraphPlaceholderNode } from "@portal/components/pipelines/graph/GraphPlaceholderNode";
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  layoutChain,
  reorderMany,
  stepIndexOf,
} from "@portal/components/pipelines/graph/pipelineLayout";
import { useStepDraggable } from "@portal/components/pipelines/graph/useChainDragDrop";
import "@portal/components/pipelines/graph/PipelineGraph.css";

// The wire renders it, but callers build it, so it is re-exported from the graph they talk to.
export type { ChainWarning };

/**
 * What is selected: an end of the chain, one or more steps, or nothing. Only steps come in sets -
 * the input and output are fixed ends, so there is nothing to gather or move.
 */
export type GraphSelection = "input" | "output" | { steps: number[] } | null;

/** The selected step indices, in chain order. Empty unless steps are what is selected. */
export function selectedSteps(selection: GraphSelection): number[] {
  return selection !== null && typeof selection === "object"
    ? selection.steps
    : [];
}

/** A node's display content. The graph never derives copy - the builder owns every label. */
export interface GraphNodeContent {
  label: string;
  /** One-line summary: the source's path, a step's parameters, the destination. */
  detail?: string;
  /** Why this node blocks saving, shown in place of the detail. */
  warning?: string;
  /** Why the input will not be much use. */
  inputWarning?: ChainWarning;
}

export interface GraphStepContent extends GraphNodeContent {
  icon?: ReactNode;
  runState?: NodeRunState;
}

/** Which end of the chain: the two nodes every finished pipeline has, one of each. */
export type ChainEnd = "input" | "output";

export interface PipelineGraphProps {
  /**
   * The chain's ends, or null while a new pipeline has yet to ask for one. Null renders the row as a
   * placeholder to fill rather than a node owing a choice, which is what keeps a brand new pipeline
   * from opening on a pair of warnings about decisions its author has not been offered yet.
   */
  input: GraphNodeContent | null;
  output: GraphNodeContent | null;
  steps: GraphStepContent[];
  selected: GraphSelection;
  onSelect: (selection: GraphSelection) => void;
  /** Put an end on the chain, ready to be configured. */
  onAddEnd: (end: ChainEnd) => void;
  /** Take an end back off, returning its row to a placeholder. */
  onRemoveEnd: (end: ChainEnd) => void;
  /** Add a step in the slot the clicked wire opens. */
  onInsertStep: (index: number) => void;
  /** Remove every step given, in one go. */
  onRemoveSteps: (indices: number[]) => void;
  /** Reorder the chain to the given original step indices; `moved` is what the drag carried. */
  onReorderSteps: (order: number[], moved: readonly number[]) => void;
  onOpenStepError?: (index: number) => void;
}

/**
 * The pipeline as a graph: one input, the steps in run order, one output.
 *
 * Layout is derived from the chain (see pipelineLayout), so there is nothing to lock, nothing to
 * re-tidy and no stored positions - a node is always where its place in the order says it is.
 * Dragging a step onto a wire moves it into that slot; clicking a node opens its settings in the
 * inspector; the wires carry the insert affordance.
 */
export function PipelineGraph({
  input,
  output,
  steps,
  selected,
  onSelect,
  onAddEnd,
  onRemoveEnd,
  onInsertStep,
  onRemoveSteps,
  onReorderSteps,
  onOpenStepError,
}: PipelineGraphProps) {
  const { t } = useTranslation();
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const { nodes, edges, width, height } = layoutChain({
    stepCount: steps.length,
  });

  const graphRef = useRef<HTMLDivElement | null>(null);
  // A keyboard reorder renumbers the nodes, so the focused card is no longer under the cursor's
  // hand: without moving focus to where the step landed, a second Alt+Arrow would act on whatever
  // now sits at the old position. Set by the handler, applied once the new order has rendered.
  const focusStepAfterRender = useRef<number | null>(null);
  useLayoutEffect(() => {
    const position = focusStepAfterRender.current;
    if (position === null) return;
    focusStepAfterRender.current = null;
    graphRef.current
      ?.querySelector<HTMLElement>(
        `[data-step-index="${position}"] .sui-node-card__select`,
      )
      ?.focus();
  });

  // A wire carries the warning belonging to the node it arrives at.
  const arrivalWarning = (nodeId: string): ChainWarning | undefined => {
    if (nodeId === "output") return output?.inputWarning;
    const index = stepIndexOf(nodeId);
    return index === null ? undefined : steps[index]?.inputWarning;
  };

  /**
   * Clicking the canvas itself clears the selection. Anything that is part of a node, a wire or the
   * placeholder handles its own click, so only bare background gets here.
   */
  function onBackgroundClick(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (
      target.closest(
        "[data-graph-node], .portal-graph-edge, .portal-graph-placeholder",
      )
    ) {
      return;
    }
    onSelect(null);
  }

  const chosen = selectedSteps(selected);

  /**
   * Plain click selects one step. Cmd/Ctrl toggles a step in or out of the selection; Shift takes
   * everything between the first selected step and this one. The ends of the chain are single-only.
   */
  function selectStep(index: number, event: ReactMouseEvent) {
    if (event.metaKey || event.ctrlKey) {
      const next = chosen.includes(index)
        ? chosen.filter((i) => i !== index)
        : [...chosen, index].sort((a, b) => a - b);
      onSelect(next.length > 0 ? { steps: next } : null);
      return;
    }
    if (event.shiftKey && chosen.length > 0) {
      const anchor = chosen[0];
      const [from, to] = anchor <= index ? [anchor, index] : [index, anchor];
      const span = [];
      for (let i = from; i <= to; i++) span.push(i);
      onSelect({ steps: span });
      return;
    }
    onSelect({ steps: [index] });
  }

  /**
   * Move the selected step(s) one slot along the chain - the keyboard alternative to dragging, which
   * pointer-only users cannot reach. Alt with an arrow, so a plain arrow is still free for anything
   * that later wants it. The moved block stays selected and takes focus with it, so it can be walked
   * several slots in a row.
   */
  function moveSelection(direction: "up" | "down"): boolean {
    if (chosen.length === 0) return false;
    const min = chosen[0];
    const max = chosen[chosen.length - 1];
    // reorderMany's slot is against the original chain: a step's own neighbouring slots are no-ops,
    // so up aims one before the block and down one past it.
    const slot = direction === "up" ? min - 1 : max + 2;
    const order = reorderMany(steps.length, chosen, slot);
    if (order === null) return false; // already at that end of the chain
    focusStepAfterRender.current = order.indexOf(min);
    onReorderSteps(order, chosen);
    return true;
  }

  /**
   * Delete removes whatever is selected: every selected step, or an end of the chain (which returns
   * its row to a placeholder, exactly as that node's X does). Alt + Up/Down reorders the selection.
   * Scoped to the graph, so typing in the inspector's fields is never intercepted.
   */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
      event.altKey &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      // Ends do not reorder (chosen is empty for them), so this only fires for a step selection.
      if (moveSelection(event.key === "ArrowUp" ? "up" : "down")) {
        event.preventDefault();
      }
      return;
    }
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    if (selected === "input" || selected === "output") {
      event.preventDefault();
      onRemoveEnd(selected);
      return;
    }
    if (chosen.length === 0) return;
    event.preventDefault();
    onRemoveSteps(chosen);
  }

  return (
    <div
      ref={graphRef}
      className="portal-graph"
      onKeyDown={onKeyDown}
      onClick={onBackgroundClick}
    >
      <div
        className="portal-graph__canvas"
        style={{ width: `${width}px`, height: `${height}px` }}
      >
        {edges.map((edge) => (
          <GraphEdge
            key={edge.id}
            edge={edge}
            onInsert={onInsertStep}
            stepCount={steps.length}
            onReorder={onReorderSteps}
            dragActive={draggingIndex !== null}
            warning={arrivalWarning(edge.to)}
          />
        ))}

        {draggingIndex !== null && edges.length > 0 && (
          <p
            className="portal-graph__drag-hint"
            aria-live="polite"
            style={{
              left: `${edges[0].x}px`,
              top: `${(edges[0].y1 + edges[0].y2) / 2}px`,
            }}
          >
            {t("portal.pipelines.graph.dragHint")}
          </p>
        )}

        {nodes.map((node) => {
          const style = {
            left: `${node.x}px`,
            top: `${node.y}px`,
            width: `${NODE_WIDTH}px`,
            minHeight: `${NODE_HEIGHT}px`,
          };
          if (node.kind === "placeholder") {
            return (
              <div className="portal-graph__slot" key={node.id} style={style}>
                <GraphPlaceholderNode
                  label={t("portal.pipelines.graph.addFirstTool")}
                  onAdd={() => onInsertStep(0)}
                />
              </div>
            );
          }
          if (node.kind === "input" || node.kind === "output") {
            const kind = node.kind;
            const content = kind === "input" ? input : output;
            return (
              <div className="portal-graph__slot" key={node.id} style={style}>
                {content === null ? (
                  <GraphPlaceholderNode
                    label={t(`portal.pipelines.graph.add.${kind}`)}
                    onAdd={() => onAddEnd(kind)}
                  />
                ) : (
                  <GraphNode
                    kind={kind}
                    title={content.label}
                    detail={content.detail}
                    warning={content.warning}
                    selected={selected === kind}
                    onSelect={() => onSelect(kind)}
                    onRemove={() => onRemoveEnd(kind)}
                  />
                )}
              </div>
            );
          }
          const index = node.stepIndex ?? 0;
          return (
            <div className="portal-graph__slot" key={node.id} style={style}>
              <ChainStepNode
                index={index}
                step={steps[index]}
                selected={chosen.includes(index)}
                // Dragging any node of a selection lifts the whole selection, so they all dim.
                dragging={
                  draggingIndex !== null &&
                  (draggingIndex === index ||
                    (chosen.includes(draggingIndex) && chosen.includes(index)))
                }
                moving={chosen.includes(index) ? chosen : [index]}
                onSelect={(event) => selectStep(index, event)}
                onRemove={() => onRemoveSteps([index])}
                onDragChange={(dragging) =>
                  setDraggingIndex(dragging ? index : null)
                }
                onOpenRunState={
                  steps[index].runState === "failed" && onOpenStepError
                    ? () => onOpenStepError(index)
                    : undefined
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ChainStepNodeProps {
  index: number;
  step: GraphStepContent;
  selected: boolean;
  dragging: boolean;
  /** The steps this node's drag carries: the selection when it is part of it, else just itself. */
  moving: number[];
  onSelect: (event: ReactMouseEvent) => void;
  onRemove: () => void;
  onDragChange: (dragging: boolean) => void;
  onOpenRunState?: () => void;
}

/** A step node plus its drag wiring, which needs a hook per node and so a component per node. */
function ChainStepNode({
  index,
  step,
  selected,
  dragging,
  moving,
  onSelect,
  onRemove,
  onDragChange,
  onOpenRunState,
}: ChainStepNodeProps) {
  const { ref, guardClick } = useStepDraggable({ moving, onDragChange });
  return (
    <GraphNode
      ref={ref}
      kind="step"
      stepIndex={index}
      title={step.label}
      detail={step.detail}
      warning={step.warning}
      icon={step.icon}
      runState={step.runState}
      selected={selected}
      dragging={dragging}
      onSelect={guardClick(onSelect)}
      onRemove={onRemove}
      onOpenRunState={onOpenRunState}
    />
  );
}
