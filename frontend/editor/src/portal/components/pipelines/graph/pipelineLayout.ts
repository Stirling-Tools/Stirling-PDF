/**
 * Geometry for the pipeline graph.
 *
 * A pipeline is a strict sequence - one input, an ordered run of steps, one output - so a node's
 * position carries no information that its place in the chain does not already carry. Layout is
 * therefore *derived* here on every render rather than owned by the user and persisted: there are
 * no stored coordinates to drift, nothing to lock, and nothing to re-tidy. Dragging a node is free
 * to mean "move it in the chain" instead of "move it on screen" (see useChainDragDrop).
 *
 * Everything is a single centred column, which makes each wire a straight vertical line. When the
 * model grows past one input/output and a pipeline can branch, x stops being constant and this is
 * the module that changes - callers only ever read the result.
 */

/** What a node represents. The chain always has exactly one input and one output. */
export type GraphNodeKind = "input" | "step" | "output";

/** Node id: `"input"`, `"output"`, or `"step:<index>"`. Stable for a given chain position. */
export type GraphNodeId = string;

export function stepNodeId(index: number): GraphNodeId {
  return `step:${index}`;
}

/** The step index a node id refers to, or null for the input/output nodes. */
export function stepIndexOf(id: GraphNodeId): number | null {
  const match = /^step:(\d+)$/.exec(id);
  return match ? Number(match[1]) : null;
}

export interface LaidOutNode {
  id: GraphNodeId;
  kind: GraphNodeKind;
  /** Position in the chain's step list; null for input/output. */
  stepIndex: number | null;
  /** Top-left corner, in canvas coordinates. */
  x: number;
  y: number;
}

export interface LaidOutEdge {
  id: string;
  from: GraphNodeId;
  to: GraphNodeId;
  /**
   * Where a step dropped on this wire lands in the step list. Null means the wire refuses
   * inserts - the step above it must stay last (encryption locks the output).
   */
  insertIndex: number | null;
  /** Straight vertical wire, from the upper node's bottom port to the lower node's top port. */
  x: number;
  y1: number;
  y2: number;
}

export interface LaidOutChain {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  /** Canvas extent, so the scroll container can size itself without measuring. */
  width: number;
  height: number;
}

/** Node box, and the vertical room a wire plus its insert affordance needs between two of them. */
export const NODE_WIDTH = 260;
export const NODE_HEIGHT = 64;
export const EDGE_LENGTH = 48;

const ROW_PITCH = NODE_HEIGHT + EDGE_LENGTH;

export interface LayoutChainOptions {
  stepCount: number;
  /**
   * Steps that must remain last, aligned with the step list. The wire below such a step accepts
   * no insert, so nothing can be placed after it.
   */
  stepFinalOnly?: readonly boolean[];
}

/**
 * Lay the chain out top to bottom: input, each step in order, output. Rows are evenly pitched and
 * share one x, so wires are vertical and always aligned.
 */
export function layoutChain({
  stepCount,
  stepFinalOnly,
}: LayoutChainOptions): LaidOutChain {
  const nodes: LaidOutNode[] = [];
  const row = (index: number) => index * ROW_PITCH;

  nodes.push({ id: "input", kind: "input", stepIndex: null, x: 0, y: row(0) });
  for (let i = 0; i < stepCount; i++) {
    nodes.push({
      id: stepNodeId(i),
      kind: "step",
      stepIndex: i,
      x: 0,
      y: row(i + 1),
    });
  }
  nodes.push({
    id: "output",
    kind: "output",
    stepIndex: null,
    x: 0,
    y: row(stepCount + 1),
  });

  const centreX = NODE_WIDTH / 2;
  const edges: LaidOutEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const upper = nodes[i];
    const lower = nodes[i + 1];
    // A wire's insert index is the step slot it sits above: the wire below the input opens slot 0,
    // the wire below step i opens slot i+1. A final-only step closes the wire beneath it.
    const above = upper.stepIndex;
    const insertIndex =
      above !== null && stepFinalOnly?.[above] ? null : (above ?? -1) + 1;
    edges.push({
      id: `${upper.id}->${lower.id}`,
      from: upper.id,
      to: lower.id,
      insertIndex,
      x: centreX,
      y1: upper.y + NODE_HEIGHT,
      y2: lower.y,
    });
  }

  return {
    nodes,
    edges,
    width: NODE_WIDTH,
    height: row(stepCount + 1) + NODE_HEIGHT,
  };
}

/**
 * Where a step lands when dropped on a wire. Lifting the step out of the chain first shifts every
 * later slot up by one, so a drop below its own position needs that accounted for. Returns null
 * when the move is a no-op (either side of the step's own position leaves it where it was).
 */
export function reorderTarget(
  fromIndex: number,
  insertIndex: number,
): number | null {
  const target = insertIndex > fromIndex ? insertIndex - 1 : insertIndex;
  return target === fromIndex ? null : target;
}
