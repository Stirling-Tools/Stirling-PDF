import React from "react";
import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  compareCsvValues,
  CsvViewer,
} from "@app/components/viewer/nonpdf/CsvViewer";

const renderViewer = (ui: React.ReactElement) =>
  render(<MantineProvider>{ui}</MantineProvider>);

/** File.text() resolves after mount; flush it so React does not update outside act. */
const flushFileRead = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const csvFile = (content: string) =>
  ({
    name: "sample.csv",
    size: content.length,
    text: async () => content,
  }) as File;

describe("compareCsvValues", () => {
  it("orders decimals and negatives by numeric value", () => {
    expect(compareCsvValues("1.25", "1.5")).toBeLessThan(0);
    expect(compareCsvValues("-10", "-5")).toBeLessThan(0);
    expect(compareCsvValues("1,000", "999")).toBeGreaterThan(0);
  });

  it("keeps numeric cells before text and sorts text naturally", () => {
    expect(compareCsvValues("12", "item-2")).toBeLessThan(0);
    expect(compareCsvValues("item-2", "item-10")).toBeLessThan(0);
  });
});

describe("CsvViewer", () => {
  it("shows the empty-file message for an empty CSV", async () => {
    renderViewer(<CsvViewer file={csvFile("")} isTsv={false} />);
    await flushFileRead();

    expect(
      await screen.findByText("viewer.nonPdf.emptyFile"),
    ).toBeInTheDocument();
  });

  it("searches every row, not only the mounted window", async () => {
    const rows = ["Name,City"];
    for (let i = 0; i < 500; i += 1) rows.push(`person-${i},City-${i}`);
    rows.push("needle,Matching Town");
    renderViewer(<CsvViewer file={csvFile(rows.join("\n"))} isTsv={false} />);

    await flushFileRead();
    const input = await screen.findByTestId("nonpdf-search-input");
    fireEvent.change(input, { target: { value: "needle" } });

    const count = await screen.findByTestId("nonpdf-search-count");
    expect(count).toHaveAttribute("data-total", "1");
    expect(count).toHaveAttribute("data-active", "0");
  });

  it("focuses the in-file search on Ctrl+F", async () => {
    renderViewer(
      <CsvViewer file={csvFile("Name,City\nAlice,Paris")} isTsv={false} />,
    );

    await flushFileRead();
    const input = await screen.findByTestId("nonpdf-search-input");
    fireEvent.keyDown(window, { key: "f", ctrlKey: true });

    expect(input).toHaveFocus();
  });
});
