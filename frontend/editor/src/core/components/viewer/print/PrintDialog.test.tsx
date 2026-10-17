import { MantineProvider } from "@mantine/core";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ViewerContext } from "@app/contexts/viewer/viewerContext";
import { computeBoxes } from "@app/components/tools/pageLayout/utils/computeBoxes";
import {
  LayoutSheetPreview,
  PosterTilePreview,
  PrintDialog,
} from "@app/components/viewer/print/PrintDialog";
import { defaultPrintSettings } from "@app/components/viewer/print/printJob";
import type { PrintSettings } from "@app/components/viewer/print/printJob";
import type { PreviewPageState } from "@app/components/viewer/print/usePrintPreviewImages";

/**
 * Records the keys and values every `t` call receives while still returning the
 * raw key, so a test can assert what the dialog asked a counter to render.
 */
const mockT = vi.hoisted(() => vi.fn((key: string) => key));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mockT, i18n: { changeLanguage: vi.fn() } }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
  I18nextProvider: ({ children }: { children: ReactNode }) => children,
}));

/** A viewer stub: the print hooks only need the position and the document id. */
const viewerAt = (
  pageCount: number,
  thumbnailAPI: {
    renderThumb: (index: number, scale: number) => unknown;
  } | null = null,
) =>
  ({
    activeFileId: "doc-1",
    getScrollState: () => ({ currentPage: 3, totalPages: pageCount }),
    registerImmediateScrollUpdate: () => () => {},
    getThumbnailAPI: () => thumbnailAPI,
  }) as never;

const renderDialog = (props: {
  systemPrintDialog?: boolean;
  fileName?: string;
  pageCount?: number;
  open?: boolean;
  canPrint?: boolean;
  documentId?: string | null;
  thumbnailAPI?: {
    renderThumb: (index: number, scale: number) => unknown;
  } | null;
  onPrint?: (settings: PrintSettings, pageCount: number) => void;
}) => {
  const onPrint = props.onPrint ?? vi.fn();
  const onClose = vi.fn();
  const dialog = (open: boolean, documentId = props.documentId) => (
    <PrintDialog
      open={open}
      onClose={onClose}
      onPrint={onPrint}
      fileName={props.fileName}
      systemPrintDialog={props.systemPrintDialog}
      canPrint={props.canPrint}
      documentId={documentId}
    />
  );
  const tree = (open: boolean, documentId = props.documentId) => (
    <MantineProvider env="test">
      {props.pageCount === undefined ? (
        dialog(open, documentId)
      ) : (
        <ViewerContext.Provider
          value={viewerAt(props.pageCount, props.thumbnailAPI ?? null)}
        >
          {dialog(open, documentId)}
        </ViewerContext.Provider>
      )}
    </MantineProvider>
  );
  const result = render(tree(props.open ?? true));
  // The viewer keeps the dialog mounted between opens, so a test can too.
  const setOpen = (open: boolean) => result.rerender(tree(open));
  const setDocumentId = (documentId: string | null) =>
    result.rerender(tree(props.open ?? true, documentId));
  return { onPrint, onClose, setOpen, setDocumentId, ...result };
};

const confirm = () =>
  screen.getByRole("button", { name: "viewer.print.confirm" });

const rangeField = () => {
  fireEvent.click(screen.getByText("viewer.print.pageScopeCustom"));
  return screen.getByPlaceholderText("viewer.print.pageRangePlaceholder");
};

/**
 * The dialog body form. jsdom does not submit a form when Enter is pressed in a
 * field, so a test submits it directly to exercise the same path.
 */
const printForm = (): HTMLElement => {
  const form = document.getElementById("print-dialog-form");
  if (!form) {
    throw new Error("the print dialog form was not rendered");
  }
  return form;
};

describe("PrintDialog", () => {
  it("prints the standard layout with the typed page range", () => {
    const { onPrint } = renderDialog({});

    fireEvent.change(rangeField(), {
      target: { value: "2-4" },
    });
    fireEvent.click(confirm());

    expect(onPrint).toHaveBeenCalledTimes(1);
    expect(onPrint).toHaveBeenCalledWith(
      expect.objectContaining({
        preset: "standard",
        pageRange: "2-4",
        includeAnnotations: true,
      }),
      0,
    );
  });

  it("leaves the page range to the system dialog", () => {
    renderDialog({ systemPrintDialog: true });

    expect(
      screen.queryByPlaceholderText("viewer.print.pageRangePlaceholder"),
    ).toBeNull();
    expect(screen.getByText("viewer.print.nativeRangeNote")).toBeTruthy();
  });

  it("refuses to start a job for a document that forbids printing", () => {
    const { onPrint } = renderDialog({ canPrint: false });

    expect(confirm()).toBeDisabled();
    fireEvent.click(confirm());

    expect(onPrint).not.toHaveBeenCalled();
    expect(screen.getByText("encryptedPdfUnlock.printRestricted")).toBeTruthy();
  });

  it("carries the chosen layout into the printed settings", () => {
    const { onPrint } = renderDialog({});

    fireEvent.click(screen.getByText("viewer.print.presetBooklet"));
    fireEvent.click(confirm());

    expect(onPrint).toHaveBeenCalledWith(
      expect.objectContaining({
        preset: "booklet",
        booklet: expect.objectContaining({ pagesPerSheet: 2 }),
      }),
      0,
    );
  });

  it("starts from the default settings", () => {
    const { onPrint } = renderDialog({});

    fireEvent.click(confirm());

    expect(onPrint).toHaveBeenCalledWith(defaultPrintSettings(), 0);
  });

  it("shows the annotation setting only where the viewer honours it", () => {
    renderDialog({});
    expect(screen.getByText("viewer.print.includeAnnotations")).toBeTruthy();
  });

  it("hides the annotation setting when the system dialog decides it", () => {
    renderDialog({ systemPrintDialog: true });
    expect(screen.queryByText("viewer.print.includeAnnotations")).toBeNull();
  });

  it("explains an unreadable page range instead of only disabling Print", () => {
    renderDialog({});

    fireEvent.change(rangeField(), { target: { value: "abc" } });

    expect((confirm() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("viewer.print.invalidPageRange")).toBeTruthy();
  });

  it("keeps a scope, the current page and a typed range in agreement", () => {
    const { onPrint } = renderDialog({ pageCount: 12 });

    fireEvent.click(screen.getByText("viewer.print.pageScopeCurrent"));
    fireEvent.click(confirm());
    expect(onPrint).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageRange: "3" }),
      12,
    );

    fireEvent.change(rangeField(), { target: { value: "5-6" } });
    expect(
      (
        screen.getByPlaceholderText(
          "viewer.print.pageRangePlaceholder",
        ) as HTMLInputElement
      ).value,
    ).toBe("5-6");
  });

  it("refuses an empty custom range rather than printing every page", () => {
    const { onPrint } = renderDialog({ pageCount: 12 });

    const field = rangeField();
    fireEvent.change(field, { target: { value: "" } });

    expect((confirm() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("viewer.print.invalidPageRange")).toBeTruthy();
    expect(onPrint).not.toHaveBeenCalled();
  });

  it("explains poster tiles outside the range the endpoint takes", () => {
    renderDialog({});

    fireEvent.click(screen.getByText("viewer.print.presetPoster"));
    fireEvent.change(screen.getByLabelText("viewer.print.posterColumns"), {
      target: { value: "11" },
    });

    expect((confirm() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("viewer.print.invalidTiles")).toBeTruthy();
  });

  it("refuses a range that selects no page of the document", () => {
    renderDialog({ pageCount: 12 });

    fireEvent.change(rangeField(), { target: { value: "99" } });

    expect((confirm() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("viewer.print.emptyPageRange")).toBeTruthy();
    // The figure must not offer a page of the document as the selection.
    expect(screen.getByText("viewer.print.noPreview")).toBeTruthy();
  });

  it("says when a range reaches past the end of the document", () => {
    renderDialog({ pageCount: 12 });

    fireEvent.change(rangeField(), { target: { value: "10-99" } });

    expect((confirm() as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("viewer.print.rangeClipped")).toBeTruthy();
  });

  it("points the range field at the reason it cannot print", () => {
    renderDialog({ pageCount: 12 });

    const range = rangeField();
    fireEvent.change(range, { target: { value: "99" } });

    expect(range.getAttribute("aria-invalid")).toBe("true");
    expect(range.getAttribute("aria-describedby")).toBe(
      "print-page-range-problem",
    );
    expect(
      document.getElementById("print-page-range-problem")?.textContent,
    ).toBe("viewer.print.emptyPageRange");
  });

  it("names the document it is about to print", () => {
    renderDialog({ fileName: "report.pdf", pageCount: 12 });

    const line = document.querySelector(".print-body__document");

    expect(line?.textContent).toContain("report.pdf");
    expect(line?.textContent).toContain("viewer.print.pageCount");
  });

  it("steps the page from the strip with the arrow keys", () => {
    renderDialog({ pageCount: 5 });

    fireEvent.change(rangeField(), { target: { value: "1-3" } });

    const next = screen.getByLabelText("viewer.print.nextPage");

    expect(next).toBeDisabled();

    fireEvent.keyDown(next, { key: "ArrowLeft" });

    expect(next).not.toBeDisabled();

    fireEvent.keyDown(next, { key: "ArrowRight" });

    expect(next).toBeDisabled();
  });

  it("returns every setting to its default", () => {
    const { onPrint } = renderDialog({ pageCount: 12 });

    fireEvent.change(rangeField(), { target: { value: "2-4" } });
    fireEvent.click(screen.getByText("viewer.print.presetBooklet"));
    fireEvent.click(screen.getByText("viewer.print.reset"));
    fireEvent.click(confirm());

    expect(onPrint).toHaveBeenCalledWith(defaultPrintSettings(), 12);
  });

  it("announces the job summary and the output position", () => {
    renderDialog({ pageCount: 12 });

    fireEvent.click(screen.getByText("viewer.print.presetBooklet"));

    const summary = document.querySelector(".print-preview__output");
    const position = document.querySelector(".print-preview__pager-label");

    expect(summary?.getAttribute("role")).toBe("status");
    expect(summary?.textContent?.length).toBeGreaterThan(0);
    expect(position?.getAttribute("role")).toBe("status");
  });

  it("keeps both settings when a booklet output mode changes them", () => {
    const { onPrint } = renderDialog({ pageCount: 12 });

    fireEvent.click(screen.getByText("viewer.print.presetBooklet"));
    fireEvent.click(screen.getByText("viewer.print.outputFronts"));
    fireEvent.click(confirm());

    expect(onPrint).toHaveBeenCalledWith(
      expect.objectContaining({
        preset: "booklet",
        booklet: expect.objectContaining({
          doubleSided: false,
          duplexPass: "FIRST",
        }),
      }),
      12,
    );
  });

  it("leaves the custom grid behind when a sheet count is chosen", () => {
    const { onPrint } = renderDialog({ pageCount: 12 });

    fireEvent.click(screen.getByText("viewer.print.presetPagesPerSheet"));
    const picker = () =>
      screen.getByRole("textbox", { name: "viewer.print.pagesPerSheetLabel" });

    fireEvent.click(picker());
    fireEvent.click(
      screen.getByRole("option", { name: "viewer.print.customGrid" }),
    );

    fireEvent.click(picker());
    fireEvent.click(screen.getByRole("option", { name: "2" }));

    fireEvent.click(confirm());

    expect(onPrint).toHaveBeenCalledWith(
      expect.objectContaining({
        layout: expect.objectContaining({ mode: "DEFAULT", pagesPerSheet: 2 }),
      }),
      12,
    );
  });

  it("prints a manual pass single-sided rather than doubling it", () => {
    renderDialog({ pageCount: 12 });

    fireEvent.click(screen.getByText("viewer.print.presetBooklet"));
    expect(screen.getByText("viewer.print.noteBooklet")).toBeTruthy();

    fireEvent.click(screen.getByText("viewer.print.outputBacks"));

    expect(screen.getByText("viewer.print.noteBookletBacks")).toBeTruthy();
    expect(screen.queryByText("viewer.print.noteBooklet")).toBeNull();
  });

  it("asks for the pages of the booklet side it shows", async () => {
    const resolvers: Array<() => void> = [];
    const renderThumb = vi.fn(() => ({
      toPromise: () =>
        new Promise<Blob>((resolve) => {
          resolvers.push(() => resolve(new Blob()));
        }),
    }));
    renderDialog({ pageCount: 12, thumbnailAPI: { renderThumb } });

    fireEvent.click(screen.getByText("viewer.print.presetBooklet"));
    renderThumb.mockClear();

    // The second side of a twelve page booklet carries pages 4 and 9, and page
    // 9 is rendered for no other preview, so it can only come from here.
    fireEvent.click(screen.getByLabelText("viewer.print.nextSide"));

    await waitFor(() => {
      expect(renderThumb).toHaveBeenCalledWith(3, 0.5);
      expect(renderThumb).toHaveBeenCalledWith(8, 0.5);
    });

    await act(async () => {
      resolvers.forEach((resolve) => resolve());
    });
  });

  it("imposes the booklet as the folded sides it prints", () => {
    renderDialog({ pageCount: 12 });

    fireEvent.click(screen.getByText("viewer.print.presetBooklet"));

    expect(badges(document.body)).toEqual(["10", "3"]);

    fireEvent.click(screen.getByLabelText("viewer.print.nextSide"));

    expect(badges(document.body)).toEqual(["4", "9"]);
  });

  it("closes only the enlarged preview when Escape is pressed in it", () => {
    const { onClose } = renderDialog({ pageCount: 12 });

    fireEvent.click(screen.getByLabelText("viewer.print.enlargePreview"));
    expect(document.querySelector(".print-preview--enlarged")).toBeTruthy();

    fireEvent.keyDown(document.body, { key: "Escape" });

    expect(document.querySelector(".print-preview--enlarged")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    // With the overlay gone the dialog is the topmost surface, so the next
    // Escape closes it once rather than both at the same time.
    fireEvent.keyDown(document.body, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("enlarges the preview without offering to enlarge itself", () => {
    renderDialog({ pageCount: 12 });

    expect(document.querySelector(".print-preview--enlarged")).toBeNull();

    fireEvent.click(screen.getByLabelText("viewer.print.enlargePreview"));

    const enlarged = document.querySelector(".print-preview--enlarged");

    expect(enlarged).toBeTruthy();
    expect(
      (enlarged as HTMLElement).querySelector(
        '[aria-label="viewer.print.enlargePreview"]',
      ),
    ).toBeNull();
    // The overlay's title names the figure, so the copy inside repeats no label.
    expect(
      (enlarged as HTMLElement).querySelector(".print-preview__label"),
    ).toBeNull();
  });

  it("lifts the enlarged and stepped views when the dialog closes", () => {
    const { setOpen } = renderDialog({ pageCount: 12 });

    fireEvent.click(screen.getByText("viewer.print.presetBooklet"));
    fireEvent.click(screen.getByLabelText("viewer.print.nextSide"));

    expect(badges(document.body)).toEqual(["4", "9"]);

    fireEvent.click(screen.getByLabelText("viewer.print.enlargePreview"));

    expect(document.querySelector(".print-preview--enlarged")).toBeTruthy();

    setOpen(false);
    expect(screen.queryByLabelText("viewer.print.enlargePreview")).toBeNull();

    // Reopening starts from the viewer's page again, not from where it was left.
    setOpen(true);

    expect(document.querySelector(".print-preview--enlarged")).toBeNull();
    expect(badges(document.body)).toEqual(["10", "3"]);
  });

  it("steps through the output sides of a pages-per-sheet job", () => {
    renderDialog({ pageCount: 12 });

    fireEvent.click(screen.getByText("viewer.print.presetPagesPerSheet"));
    expect(badges(document.body)).toEqual(["1", "2", "3", "4"]);

    fireEvent.click(screen.getByLabelText("viewer.print.nextSide"));

    expect(badges(document.body)).toEqual(["5", "6", "7", "8"]);
  });

  it("resets the page selection for a new document and keeps the layout", () => {
    const { onPrint, setDocumentId } = renderDialog({
      pageCount: 12,
      documentId: "doc-1",
    });

    fireEvent.change(rangeField(), { target: { value: "2-4" } });

    fireEvent.click(screen.getByText("viewer.print.presetPagesPerSheet"));
    fireEvent.click(
      screen.getByRole("textbox", { name: "pageLayout.orientation.label" }),
    );
    fireEvent.click(
      screen.getByRole("option", { name: "pageLayout.orientation.landscape" }),
    );

    fireEvent.click(screen.getByText("viewer.print.presetPoster"));
    fireEvent.click(
      screen.getByRole("textbox", { name: "viewer.print.posterPageSize" }),
    );
    fireEvent.click(screen.getByRole("option", { name: "A3" }));

    fireEvent.click(screen.getByText("viewer.print.presetBooklet"));
    fireEvent.click(screen.getByText("viewer.print.bindingRight"));

    setDocumentId("doc-2");

    // The layout choices describe the reader's intent, so they survive.
    fireEvent.click(confirm());
    expect(onPrint).toHaveBeenLastCalledWith(
      expect.objectContaining({
        preset: "booklet",
        layout: expect.objectContaining({ orientation: "LANDSCAPE" }),
        poster: expect.objectContaining({ pageSize: "A3" }),
        booklet: expect.objectContaining({ spineLocation: "RIGHT" }),
      }),
      12,
    );

    // The selection belonged to the previous document, so it is gone: the
    // custom scope is no longer chosen and the range it held is empty.
    fireEvent.click(screen.getByText("viewer.print.presetStandard"));
    expect(
      screen.queryByPlaceholderText("viewer.print.pageRangePlaceholder"),
    ).toBeNull();

    fireEvent.click(confirm());
    expect(onPrint).toHaveBeenLastCalledWith(
      expect.objectContaining({ preset: "standard", pageRange: "" }),
      12,
    );
  });

  it("keeps a typed range when the same document re-renders", () => {
    const { setDocumentId } = renderDialog({
      pageCount: 12,
      documentId: "doc-1",
    });

    fireEvent.change(rangeField(), { target: { value: "2-4" } });

    setDocumentId("doc-1");

    expect(
      (
        screen.getByPlaceholderText(
          "viewer.print.pageRangePlaceholder",
        ) as HTMLInputElement
      ).value,
    ).toBe("2-4");
  });

  it("does not refuse another preset for the plain preset's blank range", () => {
    renderDialog({ pageCount: 12 });

    fireEvent.change(rangeField(), { target: { value: "" } });
    expect(screen.getByText("viewer.print.invalidPageRange")).toBeTruthy();
    expect(confirm()).toBeDisabled();

    fireEvent.click(screen.getByText("viewer.print.presetBooklet"));
    expect(screen.queryByText("viewer.print.invalidPageRange")).toBeNull();
    expect(confirm()).toBeEnabled();

    fireEvent.click(screen.getByText("viewer.print.presetPoster"));
    expect(screen.queryByText("viewer.print.invalidPageRange")).toBeNull();
    expect(confirm()).toBeEnabled();

    fireEvent.click(screen.getByText("viewer.print.presetPagesPerSheet"));
    expect(screen.queryByText("viewer.print.invalidPageRange")).toBeNull();
    expect(confirm()).toBeEnabled();
  });

  it("refuses a cleared page grid without inventing a count", () => {
    renderDialog({ pageCount: 12 });

    fireEvent.click(screen.getByText("viewer.print.presetPagesPerSheet"));
    fireEvent.click(
      screen.getByRole("textbox", { name: "viewer.print.pagesPerSheetLabel" }),
    );
    fireEvent.click(
      screen.getByRole("option", { name: "viewer.print.customGrid" }),
    );

    fireEvent.change(screen.getByLabelText("pageLayout.rows"), {
      target: { value: "" },
    });
    expect(confirm()).toBeDisabled();
    expect(screen.getByText("viewer.print.invalidLayout")).toBeTruthy();
    expect(document.body.textContent ?? "").not.toMatch(/Infinity|NaN/);

    fireEvent.change(screen.getByLabelText("pageLayout.rows"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText("pageLayout.cols"), {
      target: { value: "" },
    });
    expect(confirm()).toBeDisabled();
    expect(document.body.textContent ?? "").not.toMatch(/Infinity|NaN/);
  });

  it("offers the odd/even filter with its three choices", () => {
    renderDialog({ pageCount: 6 });

    expect(screen.getByText("viewer.print.parityLabel")).toBeTruthy();
    expect(screen.getByText("viewer.print.parityAll")).toBeTruthy();
    expect(screen.getByText("viewer.print.parityOdd")).toBeTruthy();
    expect(screen.getByText("viewer.print.parityEven")).toBeTruthy();
  });

  it("leaves the odd/even filter to the system print dialog", () => {
    renderDialog({ systemPrintDialog: true });

    expect(screen.queryByText("viewer.print.parityLabel")).toBeNull();
    expect(screen.queryByText("viewer.print.parityAll")).toBeNull();
    expect(screen.queryByText("viewer.print.parityOdd")).toBeNull();
    expect(screen.queryByText("viewer.print.parityEven")).toBeNull();
  });

  it("counts the pages an odd filter selects and prints those", () => {
    const { onPrint } = renderDialog({ pageCount: 6 });

    fireEvent.click(screen.getByText("viewer.print.parityOdd"));

    // Six pages hold three odd ones, and the counter says so before printing.
    expect(mockT).toHaveBeenCalledWith("viewer.print.rangeSelection", {
      count: 3,
      total: 6,
    });

    fireEvent.click(confirm());

    expect(onPrint).toHaveBeenCalledWith(
      expect.objectContaining({ preset: "standard", parity: "odd" }),
      6,
    );
  });

  it("keeps the odd/even filter when another document resets the range", () => {
    const { onPrint, setDocumentId } = renderDialog({
      pageCount: 6,
      documentId: "doc-1",
    });

    fireEvent.change(rangeField(), { target: { value: "1-4" } });
    fireEvent.click(screen.getByText("viewer.print.parityOdd"));

    setDocumentId("doc-2");

    // The range and its scope belonged to the previous document, so both reset;
    // the filter is the reader's intent and stays.
    expect(
      screen.queryByPlaceholderText("viewer.print.pageRangePlaceholder"),
    ).toBeNull();

    fireEvent.click(confirm());

    expect(onPrint).toHaveBeenCalledWith(
      expect.objectContaining({ pageRange: "", parity: "odd" }),
      6,
    );
  });

  it("confirms from the range field through the dialog form", () => {
    const { onPrint } = renderDialog({ pageCount: 6 });

    fireEvent.change(rangeField(), { target: { value: "1-4" } });

    fireEvent.submit(printForm());

    expect(onPrint).toHaveBeenCalledWith(
      expect.objectContaining({ pageRange: "1-4" }),
      6,
    );
  });

  it("refuses a blank custom range submitted through the form", () => {
    const { onPrint } = renderDialog({ pageCount: 6 });

    fireEvent.change(rangeField(), { target: { value: "" } });

    fireEvent.submit(printForm());

    expect(onPrint).not.toHaveBeenCalled();
    expect(confirm()).toBeDisabled();
  });
});

const sheet = { x: 0, y: 0, width: 210, height: 297 };
const cells = computeBoxes(sheet, defaultPrintSettings().layout);

const renderFigure = (figure: ReactElement) =>
  render(<MantineProvider env="test">{figure}</MantineProvider>);

const sources = (container: HTMLElement, selector: string) =>
  [...container.querySelectorAll(selector)].map((image) =>
    image.getAttribute("src"),
  );

const badges = (container: HTMLElement) =>
  [...container.querySelectorAll(".print-badge")].map(
    (badge) => badge.textContent,
  );

describe("print preview figures", () => {
  it("holds the rendered page in each cell of the layout", () => {
    const { container } = renderFigure(
      <LayoutSheetPreview
        cells={cells}
        sheet={sheet}
        landscape={false}
        bordered={false}
        pageImage={(page) => `blob:page-${page}`}
      />,
    );

    expect(sources(container, ".print-sheet__image")).toEqual([
      "blob:page-1",
      "blob:page-2",
      "blob:page-3",
      "blob:page-4",
    ]);
  });

  // The dialog re-renders on every page the reader turns while it is open, so a
  // sheet whose own imposition did not change must not be drawn again.
  it("keeps a sheet whose imposition did not change", () => {
    const pageImage = vi.fn(() => null);
    const pageState = vi.fn((): PreviewPageState => "ready");
    const figure = (
      <LayoutSheetPreview
        cells={cells}
        sheet={sheet}
        landscape={false}
        bordered={false}
        pageImage={pageImage}
        pageState={pageState}
        pageCount={4}
      />
    );
    const { rerender } = renderFigure(figure);
    const drawn = pageImage.mock.calls.length;

    rerender(<MantineProvider env="test">{figure}</MantineProvider>);

    expect(pageState).toHaveBeenCalled();
    expect(pageImage.mock.calls.length).toBe(drawn);
  });

  it("leaves a cell empty when the document has no page for it", () => {
    const { container } = renderFigure(
      <LayoutSheetPreview
        cells={cells}
        sheet={sheet}
        landscape={false}
        bordered={false}
        pageImage={() => null}
      />,
    );

    expect(container.querySelectorAll(".print-sheet__image")).toHaveLength(0);
    expect(container.querySelectorAll(".print-badge")).toHaveLength(4);
  });

  it("rules the cells only when the layout draws its own borders", () => {
    const { container } = renderFigure(
      <LayoutSheetPreview
        cells={cells}
        sheet={sheet}
        landscape={false}
        bordered
        pageImage={() => null}
      />,
    );

    expect(
      container.querySelectorAll(".print-sheet__cell--bordered"),
    ).toHaveLength(4);
  });

  it("draws the poster's page whole under a grid of numbered tiles", () => {
    const { container } = renderFigure(
      <PosterTilePreview
        columns={2}
        rows={2}
        rightToLeft={false}
        pageImage={() => "blob:page-1"}
      />,
    );

    expect(sources(container, ".print-tiles__page")).toEqual(["blob:page-1"]);
    expect(container.querySelectorAll(".print-tiles__tile")).toHaveLength(4);
  });

  it("marks a cell whose page is still rendering", () => {
    const { container } = renderFigure(
      <LayoutSheetPreview
        cells={cells}
        sheet={sheet}
        landscape={false}
        bordered={false}
        pageImage={() => null}
        pageState={() => "loading"}
      />,
    );

    expect(
      container.querySelectorAll(".print-sheet__cell--pending"),
    ).toHaveLength(4);
  });

  it("numbers the poster tiles from the right when it reads right to left", () => {
    const { container } = renderFigure(
      <PosterTilePreview
        columns={2}
        rows={2}
        rightToLeft
        pageImage={() => null}
      />,
    );

    expect(badges(container)).toEqual(["2", "1", "4", "3"]);
  });

  it("lays the tile grid over the page the figure is drawn from", () => {
    const { container } = renderFigure(
      <PosterTilePreview
        columns={2}
        rows={2}
        rightToLeft={false}
        pageImage={() => "blob:page-1"}
      />,
    );

    expect(container.querySelector(".print-tiles__paper")).toBeNull();
    expect(container.querySelector(".print-tiles__grid")).toBeTruthy();
  });

  it("shows the paper while the page it divides is missing", () => {
    const { container } = renderFigure(
      <PosterTilePreview
        columns={2}
        rows={2}
        rightToLeft={false}
        pageImage={() => null}
      />,
    );

    expect(container.querySelector(".print-tiles__paper")).toBeTruthy();
    expect(container.querySelector(".print-tiles__page")).toBeNull();
  });

  it("leaves a cell past the end of the document unnumbered", () => {
    const { container } = renderFigure(
      <LayoutSheetPreview
        cells={cells}
        sheet={sheet}
        landscape={false}
        bordered={false}
        pageImage={() => null}
        pageCount={3}
      />,
    );

    expect(badges(container)).toEqual(["1", "2", "3"]);
  });
});
