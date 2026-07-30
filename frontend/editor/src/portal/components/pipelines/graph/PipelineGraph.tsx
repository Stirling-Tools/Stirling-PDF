import { useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  GraphNode,
  type NodeRunState,
} from "@portal/components/pipelines/graph/GraphNode";
import { GraphEdge } from "@portal/components/pipelines/graph/GraphEdge";
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  layoutChain,
} from "@portal/components/pipelines/graph/pipelineLayout";
import { useStepDraggable } from "@portal/components/pipelines/graph/useChainDragDrop";
import "@portal/components/pipelines/graph/PipelineGraph.css";

/** What the inspector is showing: an end of the chain, a step by index, or nothing. */
export type GraphSelection = "input" | "output" | number | null;

/** A node's display content. The graph never derives copy - the builder owns every label. */
export interface GraphNodeContent {
  label: string;
  /** One-line summary: the source's path, a step's parameters, the destination. */
  detail?: string;
  /** Why this node blocks saving, shown in place of the detail. */
  warning?: string;
}

export interface GraphStepContent extends GraphNodeContent {
  icon?: ReactNode;
  /** Must remain last: nothing may be inserted after it (encryption locks the output). */
  finalOnly?: boolean;
  runState?: NodeRunState;
}

export interface PipelineGraphProps {
  input: GraphNodeContent;
  output: GraphNodeContent;
  steps: GraphStepContent[];
  selected: GraphSelection;
  onSelect: (selection: GraphSelection) => void;
  /** Add a step in the slot the clicked wire opens. */
  onInsertStep: (index: number) => void;
  onRemoveStep: (index: number) => void;
  onReorderStep: (fromIndex: number, toIndex: number) => void;
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
  onInsertStep,
  onRemoveStep,
  onReorderStep,
}: PipelineGraphProps) {
  const { t } = useTranslation();
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const { nodes, edges, width, height } = layoutChain({
    stepCount: steps.length,
    stepFinalOnly: steps.map((step) => Boolean(step.finalOnly)),
  });

  // Delete removes the selected step. Scoped to the graph, so typing in the inspector's fields is
  // never intercepted.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    if (typeof selected !== "number") return;
    event.preventDefault();
    onRemoveStep(selected);
  }

  return (
    <div className="portal-graph" onKeyDown={onKeyDown}>
      <div
        className="portal-graph__canvas"
        style={{ width: `${width}px`, height: `${height}px` }}
      >
        {edges.map((edge) => (
          <GraphEdge
            key={edge.id}
            edge={edge}
            onInsert={onInsertStep}
            onReorder={onReorderStep}
            dragActive={draggingIndex !== null}
          />
        ))}

        {nodes.map((node) => {
          const style = {
            left: `${node.x}px`,
            top: `${node.y}px`,
            width: `${NODE_WIDTH}px`,
            minHeight: `${NODE_HEIGHT}px`,
          };
          if (node.stepIndex === null) {
            const content = node.kind === "input" ? input : output;
            return (
              <div className="portal-graph__slot" key={node.id} style={style}>
                <GraphNode
                  kind={node.kind}
                  title={content.label}
                  detail={content.detail}
                  warning={content.warning}
                  selected={selected === node.kind}
                  onSelect={() => onSelect(node.kind)}
                />
              </div>
            );
          }
          const index = node.stepIndex;
          return (
            <div className="portal-graph__slot" key={node.id} style={style}>
              <ChainStepNode
                index={index}
                step={steps[index]}
                selected={selected === index}
                dragging={draggingIndex === index}
                onSelect={() => onSelect(index)}
                onRemove={() => onRemoveStep(index)}
                onDragChange={(dragging) =>
                  setDraggingIndex(dragging ? index : null)
                }
              />
            </div>
          );
        })}
      </div>

      {steps.length === 0 && (
        <p className="portal-graph__hint">
          {t("portal.pipelines.graph.emptyHint")}
        </p>
      )}
    </div>
  );
}

interface ChainStepNodeProps {
  index: number;
  step: GraphStepContent;
  selected: boolean;
  dragging: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDragChange: (dragging: boolean) => void;
}

/** A step node plus its drag wiring, which needs a hook per node and so a component per node. */
function ChainStepNode({
  index,
  step,
  selected,
  dragging,
  onSelect,
  onRemove,
  onDragChange,
}: ChainStepNodeProps) {
  const { ref, guardClick } = useStepDraggable({ index, onDragChange });
  return (
    <GraphNode
      ref={ref}
      kind="step"
      title={step.label}
      detail={step.detail}
      warning={step.warning}
      icon={step.icon}
      runState={step.runState}
      selected={selected}
      dragging={dragging}
      onSelect={guardClick(onSelect)}
      onRemove={onRemove}
    />
  );
}
