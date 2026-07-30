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
  test("an empty chain is just input and output, joined by one wire", () => {
    const { nodes, edges } = layoutChain({ stepCount: 0 });
    expect(nodes.map((n) => n.kind)).toEqual(["input", "output"]);
    expect(edges).toHaveLength(1);
    // The only wire opens the first step slot, so an empty pipeline can be filled.
    expect(edges[0].insertIndex).toBe(0);
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

  test("wires run vertically from one node's bottom to the next node's top", () => {
    const { edges } = layoutChain({ stepCount: 1 });
    expect(edges).toHaveLength(2);
    for (const edge of edges) {
      expect(edge.x).toBe(NODE_WIDTH / 2);
      expect(edge.y2).toBeGreaterThan(edge.y1);
      expect(edge.y2 - edge.y1).toBe(EDGE_LENGTH);
    }
  });

  test("each wire opens the slot it sits above", () => {
    const { edges } = layoutChain({ stepCount: 3 });
    // input->0, 0->1, 1->2, 2->output
    expect(edges.map((e) => e.insertIndex)).toEqual([0, 1, 2, 3]);
  });

  test("a final-only step closes the wire beneath it", () => {
    // Add Password locks the output: nothing may run after it.
    const { edges } = layoutChain({
      stepCount: 2,
      stepFinalOnly: [false, true],
    });
    expect(edges.map((e) => e.insertIndex)).toEqual([0, 1, null]);
  });

  test("a final-only step earlier in the chain closes only its own wire", () => {
    const { edges } = layoutChain({
      stepCount: 3,
      stepFinalOnly: [false, true, false],
    });
    expect(edges.map((e) => e.insertIndex)).toEqual([0, 1, null, 3]);
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
