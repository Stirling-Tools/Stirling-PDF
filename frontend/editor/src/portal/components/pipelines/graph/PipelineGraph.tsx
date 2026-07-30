import { useState, type KeyboardEvent, type ReactNode } from "react";
import {
  GraphNode,
  type NodeRunState,
} from "@portal/components/pipelines/graph/GraphNode";
import { GraphEdge } from "@portal/components/pipelines/graph/GraphEdge";
import { GraphPlaceholderNode } from "@portal/components/pipelines/graph/GraphPlaceholderNode";
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  layoutChain,
  stepIndexOf,
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
  /** Why the input will not be much use. */
  inputWarning?: string;
}

export interface GraphStepContent extends GraphNodeContent {
  icon?: ReactNode;
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
  onInsertStep,
  onRemoveStep,
  onReorderStep,
  onOpenStepError,
}: PipelineGraphProps) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const { nodes, edges, width, height } = layoutChain({
    stepCount: steps.length,
  });

  // A wire carries the warning belonging to the node it arrives at.
  const arrivalWarning = (nodeId: string): string | undefined => {
    if (nodeId === "output") return output.inputWarning;
    const index = stepIndexOf(nodeId);
    return index === null ? undefined : steps[index]?.inputWarning;
  };

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
            warning={arrivalWarning(edge.to)}
          />
        ))}

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
                <GraphPlaceholderNode onAdd={() => onInsertStep(0)} />
              </div>
            );
          }
          if (node.kind === "input" || node.kind === "output") {
            const kind = node.kind;
            const content = kind === "input" ? input : output;
            return (
              <div className="portal-graph__slot" key={node.id} style={style}>
                <GraphNode
                  kind={kind}
                  title={content.label}
                  detail={content.detail}
                  warning={content.warning}
                  selected={selected === kind}
                  onSelect={() => onSelect(kind)}
                />
              </div>
            );
          }
          const index = node.stepIndex ?? 0;
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
  onSelect: () => void;
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
  onSelect,
  onRemove,
  onDragChange,
  onOpenRunState,
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
      onOpenRunState={onOpenRunState}
    />
  );
}
