import { afterEach, describe, expect, it } from "vitest";
import { fillDragPreview } from "@portal/components/pipelines/graph/useChainDragDrop";

/** Stands in for the graph's rendered cards, which the preview clones out of the DOM. */
function renderCards(labels: string[]) {
  document.body.innerHTML = labels
    .map(
      (label, i) =>
        `<div class="portal-graph-node is-dragging" data-step-index="${i}">${label}</div>`,
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
