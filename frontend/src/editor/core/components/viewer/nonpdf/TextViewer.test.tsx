import React from "react";
import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TextViewer } from "@editor/components/viewer/nonpdf/TextViewer";

const renderViewer = (ui: React.ReactElement) =>
  render(<MantineProvider>{ui}</MantineProvider>);

/** File.text() resolves after mount; flush it so React does not update outside act. */
const flushFileRead = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const textFile = (content: string, name = "sample.txt") =>
  ({ name, size: content.length, text: async () => content }) as File;

const markdownFile = (content: string) =>
  ({
    name: "sample.md",
    size: content.length,
    text: async () => content,
  }) as File;

describe("TextViewer", () => {
  it("shows an empty-file message instead of a blank pane", async () => {
    renderViewer(<TextViewer file={textFile("")} isMarkdown={false} />);
    await flushFileRead();

    expect(
      await screen.findByText("viewer.nonPdf.emptyFile"),
    ).toBeInTheDocument();
  });

  it("resets viewer toggles when the opened file changes type", async () => {
    const { rerender } = render(
      <MantineProvider>
        <TextViewer file={textFile("alpha")} isMarkdown={false} />
      </MantineProvider>,
    );

    await flushFileRead();
    const lineNumbers = await screen.findByRole("checkbox", {
      name: "viewer.nonPdf.lineNumbers",
    });
    fireEvent.click(lineNumbers);
    expect(lineNumbers).not.toBeChecked();

    rerender(
      <MantineProvider>
        <TextViewer file={markdownFile("# Heading")} isMarkdown={true} />
      </MantineProvider>,
    );
    await flushFileRead();

    expect(
      await screen.findByRole("checkbox", {
        name: "viewer.nonPdf.renderMarkdown",
      }),
    ).toBeChecked();
    expect(
      screen.queryByRole("checkbox", { name: "viewer.nonPdf.lineNumbers" }),
    ).not.toBeInTheDocument();
  });

  it("counts and steps through matches across the whole file", async () => {
    renderViewer(
      <TextViewer file={textFile("alpha\nbeta\nalpha")} isMarkdown={false} />,
    );

    await flushFileRead();
    const input = screen.getByTestId("nonpdf-search-input");
    fireEvent.change(input, { target: { value: "alpha" } });

    const count = await screen.findByTestId("nonpdf-search-count");
    expect(count).toHaveAttribute("data-total", "2");
    expect(count).toHaveAttribute("data-active", "0");

    fireEvent.click(
      screen.getByRole("button", { name: "viewer.nonPdf.nextMatch" }),
    );
    expect(count).toHaveAttribute("data-active", "1");

    fireEvent.click(
      screen.getByRole("button", { name: "viewer.nonPdf.previousMatch" }),
    );
    expect(count).toHaveAttribute("data-active", "0");
  });

  it("focuses the in-file search on Ctrl+F", async () => {
    renderViewer(<TextViewer file={textFile("alpha")} isMarkdown={false} />);

    await flushFileRead();
    const input = screen.getByTestId("nonpdf-search-input");
    fireEvent.keyDown(window, { key: "f", ctrlKey: true });

    expect(input).toHaveFocus();
  });
});
