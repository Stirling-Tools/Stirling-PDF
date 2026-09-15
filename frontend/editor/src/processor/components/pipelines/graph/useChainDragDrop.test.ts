import { afterEach, describe, expect, it } from "vitest";
import {
  createDragClickGuard,
  fillDragPreview,
} from "@processor/components/pipelines/graph/useChainDragDrop";

/** Stands in for the graph's rendered cards, which the preview clones out of the DOM. */
function renderCards(labels: string[]) {
  document.body.innerHTML = labels
    .map(
      (label, i) =>
        `<div class="processor-graph-node is-dragging" data-step-index="${i}">${label}</div>`,
    )
    .join("");
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("fillDragPreview", () => {
  it("stacks a copy of every dragged card, in the order given", () => {
    renderCards(["OCR", "Redact", "Compress"]);
    const container = document.createElement("div");
    fillDragPreview(container, [0, 2]);
    expect([...container.children].map((c) => c.textContent)).toEqual([
      "OCR",
      "Compress",
    ]);
  });

  it("leaves the originals alone", () => {
    renderCards(["OCR", "Redact"]);
    fillDragPreview(document.createElement("div"), [0, 1]);
    expect(document.querySelectorAll("[data-step-index]")).toHaveLength(2);
  });

  it("copies are solid, not dimmed like the cards they came from", () => {
    renderCards(["OCR"]);
    const container = document.createElement("div");
    fillDragPreview(container, [0]);
    expect(document.querySelector("[data-step-index]")).toHaveClass(
      "is-dragging",
    );
    expect(container.firstElementChild).not.toHaveClass("is-dragging");
  });

  it("skips an index with no card rather than throwing", () => {
    renderCards(["OCR"]);
    const container = document.createElement("div");
    fillDragPreview(container, [0, 7]);
    expect(container.children).toHaveLength(1);
  });
});

// The drag itself needs native HTML5 drag events, which jsdom does not implement, so the guard's
// state machine is exercised here directly - it is the half that decides whether a click selects.
describe("createDragClickGuard", () => {
  it("lets a plain press through", () => {
    const guard = createDragClickGuard();
    guard.beginGesture();
    expect(guard.swallowsClick()).toBe(false);
  });

  it("swallows the click that trails a drag", () => {
    const guard = createDragClickGuard();
    guard.beginGesture();
    guard.noteDrag();
    expect(guard.swallowsClick()).toBe(true);
  });

  it("still selects on the next press after a drag left no click behind", () => {
    // The regression: native drag usually emits no trailing click, so a guard cleared only by
    // consuming one stayed raised and ate the user's next real click on that node.
    const guard = createDragClickGuard();
    guard.beginGesture();
    guard.noteDrag();
    // ...drop, and no click follows.
    guard.beginGesture();
    expect(guard.swallowsClick()).toBe(false);
  });

  it("guards each drag, not just the first", () => {
    const guard = createDragClickGuard();
    for (const _ of [1, 2]) {
      guard.beginGesture();
      guard.noteDrag();
      expect(guard.swallowsClick()).toBe(true);
    }
  });
});
