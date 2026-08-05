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

/**
 * What a node represents. The chain always has exactly one input and one output. `placeholder` is
 * the stand-in shown when a pipeline has no steps yet: it occupies the row the first step will take
 * so the chain's shape is visible, and it is the affordance for adding that step.
 */
export type GraphNodeKind = "input" | "step" | "output" | "placeholder";

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
   * Where a step dropped on this wire lands in the step list. Null only for the wires either side
   * of the placeholder, which is itself the affordance for adding the first step.
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
}

/**
 * Lay the chain out top to bottom: input, each step in order, output. Rows are evenly pitched and
 * share one x, so wires are vertical and always aligned.
 */
export function layoutChain({ stepCount }: LayoutChainOptions): LaidOutChain {
  const nodes: LaidOutNode[] = [];
  const row = (index: number) => index * ROW_PITCH;
  // An empty pipeline still shows a step row, filled by the placeholder, so the chain reads as
  // input -> something -> output rather than as a bare wire.
  const rows = Math.max(stepCount, 1);

  nodes.push({ id: "input", kind: "input", stepIndex: null, x: 0, y: row(0) });
  if (stepCount === 0) {
    nodes.push({
      id: "placeholder",
      kind: "placeholder",
      stepIndex: null,
      x: 0,
      y: row(1),
    });
  }
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
    y: row(rows + 1),
  });

  const centreX = NODE_WIDTH / 2;
  const edges: LaidOutEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const upper = nodes[i];
    const lower = nodes[i + 1];
    // A wire's insert index is the step slot it sits above: the wire below the input opens slot 0,
    // the wire below step i opens slot i+1. A final-only step closes the wire beneath it.
    const above = upper.stepIndex;
    // The placeholder is itself the "add the first step" affordance, so the wires either side of it
    // stay plain - two pluses for the same slot would be a choice with no difference.
    const placeholderRow =
      upper.kind === "placeholder" || lower.kind === "placeholder";
    const insertIndex = placeholderRow ? null : (above ?? -1) + 1;
    edges.push({
      id: `${upper.id}->${lower.id}`,
      from: upper.id,
      to: lower.id,
      insertIndex,
      x: centreX,
      // Exactly node-bottom to node-top: the wire meets both borders. The arrowhead is kept inside
      // this box (see GraphEdge.css) so the node, drawn after it, cannot paint over the tip.
      y1: upper.y + NODE_HEIGHT,
      y2: lower.y,
    });
  }

  return {
    nodes,
    edges,
    width: NODE_WIDTH,
    height: row(rows + 1) + NODE_HEIGHT,
  };
}

/**
 * The chain's new order after dropping `moving` on the wire that opens `insertIndex`.
 *
 * Returns the original step indices in their new positions, or null when the move changes nothing
 * (dropping a step on either of its own wires, say). The moved steps land together in the target
 * slot, keeping their order relative to each other; the slot is expressed against the *original*
 * chain, so lifting the moved steps out first has to be accounted for - which is done by counting
 * how many of the steps that stay put sit above the slot.
 */
export function reorderMany(
  stepCount: number,
  moving: readonly number[],
  insertIndex: number,
): number[] | null {
  // Range-check: a stray index would survive into `next` and then read as an undefined step, so
  // keep only positions that exist in the chain before lifting anything out.
  const lifted = [...new Set(moving)]
    .filter((i) => i >= 0 && i < stepCount)
    .sort((a, b) => a - b);
  if (lifted.length === 0) return null;

  const staying: number[] = [];
  for (let i = 0; i < stepCount; i++) {
    if (!lifted.includes(i)) staying.push(i);
  }

  const landing = staying.filter((i) => i < insertIndex).length;
  const next = [
    ...staying.slice(0, landing),
    ...lifted,
    ...staying.slice(landing),
  ];
  return next.every((value, i) => value === i) ? null : next;
}
