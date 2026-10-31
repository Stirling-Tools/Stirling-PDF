import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HeadingOutlineSection } from "@editor/tools/pdfTextEditor/components/inspector/HeadingOutlineSection";
import type { TextRunSnapshot } from "@editor/tools/pdfTextEditor/types";
import type {
  HeadingOutline,
  OutlineEntry,
} from "@editor/tools/pdfTextEditor/util/headingOutline";

const KEY = "pdfTextEditor.inspector.accessibility.outline";

function renderOutline(outline: HeadingOutline, onSelect = vi.fn()) {
  render(
    <MantineProvider env="test">
      <HeadingOutlineSection outline={outline} onSelect={onSelect} />
    </MantineProvider>,
  );
  return onSelect;
}

const entry = (
  level: number,
  text: string | null,
  issue: OutlineEntry["issue"] = null,
): OutlineEntry => ({
  type: `H${level}` as OutlineEntry["type"],
  level,
  pageIndex: 1,
  run: text === null ? null : ({ id: text, text } as TextRunSnapshot),
  range: null,
  issue,
});

describe("HeadingOutlineSection", () => {
  it("lists headings indented by level and selects the one clicked", () => {
    const onSelect = renderOutline({
      entries: [
        entry(1, "Quarterly report"),
        entry(2, "Regional\nperformance"),
      ],
      mixesNumbering: false,
    });
    const rows = screen.getAllByTestId("pdf-editor-heading-entry");
    expect(rows.map((row) => row.dataset.level)).toEqual(["1", "2"]);
    fireEvent.click(screen.getByText("Regional performance"));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("shows each issue under its heading and counts them", () => {
    renderOutline({
      entries: [
        entry(1, "Quarterly report"),
        entry(3, "Outlook", { kind: "skipped-level", previous: 1 }),
      ],
      mixesNumbering: true,
    });
    expect(screen.getByTestId("pdf-editor-heading-issue")).toHaveTextContent(
      `${KEY}.skippedLevel`,
    );
    expect(screen.getByTestId("pdf-editor-heading-mixed")).toBeVisible();
    expect(screen.getByTestId("pdf-editor-heading-problems")).toHaveTextContent(
      "2",
    );
  });

  it("names a heading by its page until that page is read", () => {
    renderOutline({ entries: [entry(1, null)], mixesNumbering: false });
    expect(screen.getByTestId("pdf-editor-heading-entry")).toHaveTextContent(
      `${KEY}.onPage`,
    );
  });

  it("says when there are no headings", () => {
    renderOutline({ entries: [], mixesNumbering: false });
    expect(screen.getByTestId("pdf-editor-heading-none")).toBeVisible();
  });
});
