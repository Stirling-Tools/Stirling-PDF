import { describe, expect, test } from "vitest";
import {
  EDGE_LENGTH,
  NODE_HEIGHT,
  NODE_WIDTH,
  layoutChain,
  reorderTarget,
  stepIndexOf,
  stepNodeId,
} from "@portal/components/pipelines/graph/pipelineLayout";

describe("layoutChain", () => {
  test("an empty chain reserves the first step's row for the placeholder", () => {
    const { nodes, edges } = layoutChain({ stepCount: 0 });
    expect(nodes.map((n) => n.kind)).toEqual([
      "input",
      "placeholder",
      "output",
    ]);
    // The placeholder is the affordance, so neither wire around it offers a plus as well.
    expect(edges.map((e) => e.insertIndex)).toEqual([null, null]);
  });

  test("the empty chain is as tall as a one-step chain", () => {
    expect(layoutChain({ stepCount: 0 }).height).toBe(
      layoutChain({ stepCount: 1 }).height,
    );
  });

  test("steps sit between input and output, in order", () => {
    const { nodes } = layoutChain({ stepCount: 3 });
    expect(nodes.map((n) => n.id)).toEqual([
      "input",
      "step:0",
      "step:1",
      "step:2",
      "output",
    ]);
    expect(nodes.map((n) => n.stepIndex)).toEqual([null, 0, 1, 2, null]);
  });

  test("rows are evenly pitched down one column", () => {
    const { nodes, width } = layoutChain({ stepCount: 2 });
    expect(nodes.every((n) => n.x === 0)).toBe(true);
    const ys = nodes.map((n) => n.y);
    const pitch = NODE_HEIGHT + EDGE_LENGTH;
    expect(ys).toEqual([0, pitch, pitch * 2, pitch * 3]);
    expect(width).toBe(NODE_WIDTH);
  });

  test("the canvas is tall enough for the last node", () => {
    const { nodes, height } = layoutChain({ stepCount: 4 });
    const last = nodes[nodes.length - 1];
    expect(height).toBe(last.y + NODE_HEIGHT);
  });

  test("wires span exactly from one node's bottom border to the next node's top", () => {
    const { nodes, edges } = layoutChain({ stepCount: 1 });
    expect(edges).toHaveLength(2);
    for (const edge of edges) {
      expect(edge.x).toBe(NODE_WIDTH / 2);
      expect(edge.y2 - edge.y1).toBe(EDGE_LENGTH);
    }
    expect(edges[0].y1).toBe(nodes[0].y + NODE_HEIGHT);
    expect(edges[0].y2).toBe(nodes[1].y);
  });

  test("each wire opens the slot it sits above", () => {
    const { edges } = layoutChain({ stepCount: 3 });
    // input->0, 0->1, 1->2, 2->output
    expect(edges.map((e) => e.insertIndex)).toEqual([0, 1, 2, 3]);
  });

  test("every wire between real nodes stays open", () => {
    // Ordering is the user's to choose: no pairing is refused, however odd it is.
    const { edges } = layoutChain({ stepCount: 4 });
    expect(edges.every((e) => e.insertIndex !== null)).toBe(true);
  });
});

describe("node ids", () => {
  test("step ids round-trip through their index", () => {
    expect(stepIndexOf(stepNodeId(7))).toBe(7);
  });

  test("the input and output nodes have no step index", () => {
    expect(stepIndexOf("input")).toBeNull();
    expect(stepIndexOf("output")).toBeNull();
  });
});

describe("reorderTarget", () => {
  test("dropping below its own place accounts for the step lifting out first", () => {
    // [a b c], drag a (0) onto the wire above c (slot 2) -> [b a c], so index 1.
    expect(reorderTarget(0, 2)).toBe(1);
  });

  test("dropping above its own place lands on the slot as given", () => {
    // [a b c], drag c (2) onto the wire above b (slot 1) -> [a c b], so index 1.
    expect(reorderTarget(2, 1)).toBe(1);
  });

  test("the wires either side of a step are no-ops", () => {
    // Both the wire above and the wire below step 1 leave it exactly where it is.
    expect(reorderTarget(1, 1)).toBeNull();
    expect(reorderTarget(1, 2)).toBeNull();
  });

  test("moving to the ends works", () => {
    expect(reorderTarget(2, 0)).toBe(0);
    expect(reorderTarget(0, 3)).toBe(2);
  });
});
