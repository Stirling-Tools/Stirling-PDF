import { describe, expect, it } from "vitest";
import {
  imageStatus,
  nextTodo,
  previousTodo,
  textStatus,
  type ReviewItem,
} from "@editor/tools/pdfTextEditor/util/accessibilityProgress";

const at = (id: string, status: ReviewItem["status"]): ReviewItem => ({
  kind: "text",
  id,
  pageIndex: 0,
  bounds: { x: 0, y: 0, width: 1, height: 1 },
  status,
});

describe("textStatus", () => {
  it("counts tagged text and artifacts as done", () => {
    expect(
      textStatus({
        kind: "tagged",
        block: { role: "P", type: "P" },
        cannotRetag: null,
        canBeArtifact: true,
      }),
    ).toBe("done");
    expect(
      textStatus({ kind: "artifact", furniture: null, taggable: true }),
    ).toBe("done");
  });

  it("leaves out untagged text nothing here can tag", () => {
    expect(
      textStatus({ kind: "untagged", documentTagged: true, taggable: true }),
    ).toBe("todo");
    expect(
      textStatus({ kind: "untagged", documentTagged: true, taggable: false }),
    ).toBeNull();
    expect(textStatus({ kind: "unknown" })).toBeNull();
  });
});

describe("imageStatus", () => {
  it("wants a description or a decorative mark", () => {
    expect(
      imageStatus({
        kind: "describable",
        description: null,
        type: "Figure",
        canBeDecorative: true,
      }),
    ).toBe("todo");
    expect(
      imageStatus({
        kind: "describable",
        description: "Revenue by region",
        type: "Figure",
        canBeDecorative: true,
      }),
    ).toBe("done");
    expect(imageStatus({ kind: "decorative", canUndecorate: true })).toBe(
      "done",
    );
  });

  it("leaves out an image it cannot describe", () => {
    expect(
      imageStatus({
        kind: "blocked",
        blocker: "untagged",
        documentTagged: true,
      }),
    ).toBeNull();
  });
});

describe("previousTodo", () => {
  const items = [
    at("a", "todo"),
    at("b", "done"),
    at("c", "todo"),
    at("d", "done"),
  ];

  it("starts from the end with nothing current", () => {
    expect(previousTodo(items, null)?.id).toBe("c");
  });

  it("moves back past the current item and wraps round", () => {
    expect(previousTodo(items, "c")?.id).toBe("a");
    expect(previousTodo(items, "a")?.id).toBe("c");
    expect(previousTodo(items, "b")?.id).toBe("a");
  });

  it("returns null once nothing else is left to do", () => {
    expect(previousTodo([at("x", "todo")], "x")).toBeNull();
  });
});

describe("nextTodo", () => {
  const items = [
    at("a", "todo"),
    at("b", "done"),
    at("c", "todo"),
    at("d", "done"),
  ];

  it("starts from the beginning with nothing current", () => {
    expect(nextTodo(items, null)?.id).toBe("a");
  });

  it("moves past the current item and wraps round", () => {
    expect(nextTodo(items, "a")?.id).toBe("c");
    expect(nextTodo(items, "c")?.id).toBe("a");
    expect(nextTodo(items, "d")?.id).toBe("a");
  });

  it("returns null once nothing is left to do", () => {
    expect(nextTodo([at("x", "done")], null)).toBeNull();
    expect(nextTodo([at("x", "todo")], "x")).toBeNull();
  });
});
