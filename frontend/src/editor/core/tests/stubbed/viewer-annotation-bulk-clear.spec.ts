import { createRequire } from "node:module";
import path from "node:path";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNull,
  PDFNumber,
  PDFString,
  StandardFonts,
} from "@cantoo/pdf-lib";
import type { Page } from "@playwright/test";
import { test, expect } from "@editor/tests/helpers/stub-test-base";
import { downloadBytes } from "@editor/tests/stubbed/saveHelpers";

const require = createRequire(import.meta.url);
// PDF.js validates a literal trailing "/" even on Windows filesystem paths.
const STANDARD_FONT_DATA_URL = `${path.join(
  path.dirname(require.resolve("pdfjs-dist/package.json")),
  "standard_fonts",
)}/`;

const DOCUMENT_TITLE = "Annotation bulk clear fixture";
const PAGE_MARKERS = [
  "Page 1 annotation bulk clear",
  "Page 2 annotation bulk clear",
];

interface ExpectedAnnotation {
  pageIndex: number;
  id: string;
  subtype: string;
  rect: number[];
  quadPoints?: number[];
  inkList?: number[][];
  preservedAuthor?: string;
}

const EXPECTED_AFTER_COMMENT_CLEAR: ExpectedAnnotation[] = [
  {
    pageIndex: 0,
    id: "highlight",
    subtype: "Highlight",
    rect: [50, 550, 250, 575],
    quadPoints: [50, 575, 250, 575, 50, 550, 250, 550],
  },
  {
    pageIndex: 0,
    id: "ink",
    subtype: "Ink",
    rect: [50, 350, 250, 375],
    inkList: [[50, 350, 150, 375, 250, 350]],
  },
  {
    pageIndex: 0,
    id: "uncommented-shape",
    subtype: "Square",
    rect: [300, 250, 450, 300],
    preservedAuthor: "Reviewer",
  },
  {
    pageIndex: 1,
    id: "shape",
    subtype: "Square",
    rect: [50, 250, 250, 300],
  },
  {
    pageIndex: 1,
    id: "underline",
    subtype: "Underline",
    rect: [50, 450, 250, 475],
    quadPoints: [50, 475, 250, 475, 50, 450, 250, 450],
  },
];

test.use({ autoGoto: "/annotate" });

async function createAnnotatedPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(DOCUMENT_TITLE);
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica);

  // Register /Helv in AcroForm default resources so the FreeText /DA string
  // resolves without relying on viewer font fallback (PDF 1.7 §12.7.3.3).
  pdf.catalog.set(
    PDFName.of("AcroForm"),
    pdf.context.obj({
      Fields: [],
      DR: { Font: { Helv: helvetica.ref } },
    }),
  );

  const page1 = pdf.addPage([600, 800]);
  page1.drawText(PAGE_MARKERS[0], { x: 50, y: 750, font: helvetica, size: 14 });
  const page2 = pdf.addPage([600, 800]);
  page2.drawText(PAGE_MARKERS[1], { x: 50, y: 750, font: helvetica, size: 14 });

  const page1Definitions = [
    {
      Subtype: "Text",
      NM: PDFString.of("standalone"),
      Rect: [40, 650, 65, 675],
      Contents: PDFString.of("Standalone comment"),
    },
    {
      Subtype: "Highlight",
      NM: PDFString.of("highlight"),
      Rect: [50, 550, 250, 575],
      QuadPoints: [50, 575, 250, 575, 50, 550, 250, 550],
      Contents: PDFString.of("Highlight comment"),
    },
    {
      Subtype: "Ink",
      NM: PDFString.of("ink"),
      Rect: [50, 350, 250, 375],
      InkList: [[50, 350, 150, 375, 250, 350]],
      Contents: PDFString.of("Ink comment"),
    },
    {
      Subtype: "Square",
      NM: PDFString.of("uncommented-shape"),
      Rect: [300, 250, 450, 300],
    },
  ];

  const page2Definitions = [
    {
      Subtype: "FreeText",
      NM: PDFString.of("free-text"),
      Rect: [80, 640, 220, 675],
      Contents: PDFString.of("Imported free text"),
      DA: PDFString.of("/Helv 12 Tf 0 g"),
    },
    {
      Subtype: "Underline",
      NM: PDFString.of("underline"),
      Rect: [50, 450, 250, 475],
      QuadPoints: [50, 475, 250, 475, 50, 450, 250, 450],
      Contents: PDFString.of("Underline comment"),
    },
    {
      Subtype: "Square",
      NM: PDFString.of("shape"),
      Rect: [50, 250, 250, 300],
      Contents: PDFString.of("Shape comment"),
    },
  ];

  const registerForPage = (
    pageRef: ReturnType<typeof pdf.addPage>["ref"],
    definitions: Record<string, unknown>[],
  ) =>
    definitions.map((definition) =>
      pdf.context.register(
        pdf.context.obj({
          Type: "Annot",
          P: pageRef,
          F: 4,
          C: [1, 0.5, 0],
          BS: { W: 2 },
          T: PDFString.of("Reviewer"),
          ...definition,
        }),
      ),
    );

  const page1Refs = registerForPage(page1.ref, page1Definitions);
  page1Refs.push(
    pdf.context.register(
      pdf.context.obj({
        Type: "Annot",
        Subtype: "Text",
        P: page1.ref,
        F: 4,
        NM: PDFString.of("reply"),
        Rect: [260, 550, 280, 575],
        IRT: page1Refs[1],
        RT: "R",
        T: PDFString.of("Reviewer"),
        Contents: PDFString.of("Reply to highlight"),
      }),
    ),
  );
  const page2Refs = registerForPage(page2.ref, page2Definitions);

  page1.node.set(PDFName.of("Annots"), pdf.context.obj(page1Refs));
  page2.node.set(PDFName.of("Annots"), pdf.context.obj(page2Refs));
  return Buffer.from(await pdf.save());
}

function readOptionalPdfText(
  annotation: PDFDict,
  key: string,
): string | undefined {
  const value = annotation.get(PDFName.of(key));
  if (value === undefined || value === PDFNull) return undefined;
  const resolved = annotation.context.lookup(value);
  if (resolved === undefined || resolved === PDFNull) return undefined;
  if (resolved instanceof PDFString || resolved instanceof PDFHexString) {
    return resolved.decodeText();
  }
  throw new Error(
    `Unexpected PDF type for /${key}: ${resolved?.constructor.name ?? typeof resolved}`,
  );
}

function readNumberArray(
  annotation: PDFDict,
  key: string,
): number[] | undefined {
  const value = annotation.get(PDFName.of(key));
  if (value === undefined || value === PDFNull) return undefined;
  const resolved = annotation.context.lookup(value);
  if (resolved === undefined || resolved === PDFNull) return undefined;
  const array = annotation.lookup(PDFName.of(key), PDFArray);
  return Array.from({ length: array.size() }, (_, index) =>
    array.lookup(index, PDFNumber).asNumber(),
  );
}

function readInkList(annotation: PDFDict): number[][] | undefined {
  const value = annotation.get(PDFName.of("InkList"));
  if (value === undefined || value === PDFNull) return undefined;
  const resolved = annotation.context.lookup(value);
  if (resolved === undefined || resolved === PDFNull) return undefined;
  const strokes = annotation.lookup(PDFName.of("InkList"), PDFArray);
  return Array.from({ length: strokes.size() }, (_, strokeIndex) => {
    const stroke = strokes.lookup(strokeIndex, PDFArray);
    return Array.from({ length: stroke.size() }, (_, pointIndex) =>
      stroke.lookup(pointIndex, PDFNumber).asNumber(),
    );
  });
}

async function extractPageTexts(bytes: Buffer): Promise<string[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
  }).promise;
  try {
    const texts: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const textContent = await (
        await document.getPage(pageNumber)
      ).getTextContent();
      texts.push(
        textContent.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" "),
      );
    }
    return texts;
  } finally {
    await document.destroy();
  }
}

async function confirmDialog(
  page: Page,
  dialogName: string,
  confirmLabel: string,
): Promise<void> {
  const dialog = page.getByRole("dialog", { name: dialogName, exact: true });
  const confirmButton = dialog.getByRole("button", {
    name: confirmLabel,
    exact: true,
  });
  await expect(confirmButton).toBeVisible();
  // Mantine modals animate in; clicking mid-transition can miss the button.
  await expect
    .poll(() =>
      dialog.evaluate(
        (el) =>
          el
            .getAnimations({ subtree: true })
            .filter((animation) => animation.playState === "running").length,
      ),
    )
    .toBe(0);
  await confirmButton.click();
  await expect(dialog).toBeHidden();
}

async function openFixtureWithComments(page: Page) {
  const filesButton = page.getByTestId("files-button");
  await expect(filesButton).toBeVisible({ timeout: 60_000 });
  await filesButton.click();
  await page.getByTestId("file-input").setInputFiles({
    name: "annotation-bulk-clear.pdf",
    mimeType: "application/pdf",
    buffer: await createAnnotatedPdf(),
  });
  await expect(page.locator(".file-sidebar-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
    { timeout: 0 },
  );
  await expect(page.locator('[data-page-index="0"]').first()).toBeVisible({
    timeout: 60_000,
  });

  await page
    .locator(".workbench-bar")
    .getByRole("button", { name: "Comments", exact: true })
    .click();
  const sidebar = page.locator(".comments-sidebar");
  await expect(sidebar.locator("[data-comment-card]")).toHaveCount(6);
  await expect(
    sidebar.getByText("Reply to highlight", { exact: true }),
  ).toBeVisible();
  return sidebar;
}

async function exportAnnotationSnapshot(page: Page) {
  const downloadPromise = page.waitForEvent("download");
  await page
    .locator(".workbench-bar")
    .getByRole("button", { name: "Download", exact: true })
    .click();
  const bytes = await downloadBytes(await downloadPromise);
  const pdf = await PDFDocument.load(bytes);
  const pageTexts = await extractPageTexts(bytes);

  const annotations = pdf
    .getPages()
    .flatMap((entry, pageIndex) => {
      const annots = entry.node.Annots();
      return Array.from({ length: annots?.size() ?? 0 }, (_, index) => {
        const annotation = annots!.lookup(index, PDFDict);
        return {
          pageIndex,
          id: readOptionalPdfText(annotation, "NM") ?? "",
          subtype: annotation
            .lookup(PDFName.of("Subtype"), PDFName)
            .decodeText(),
          author: readOptionalPdfText(annotation, "T"),
          contents: readOptionalPdfText(annotation, "Contents"),
          rect: readNumberArray(annotation, "Rect"),
          quadPoints: readNumberArray(annotation, "QuadPoints"),
          inkList: readInkList(annotation),
        };
      });
    })
    .sort((a, b) => a.pageIndex - b.pageIndex || a.id.localeCompare(b.id));

  return {
    title: pdf.getTitle(),
    pageCount: pdf.getPageCount(),
    pageTexts,
    annotations,
  };
}

function expectNumbersClose(
  actual: number[] | undefined,
  expected: number[],
  precision = 2,
): void {
  expect(actual).toBeDefined();
  expect(actual).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(actual![i]).toBeCloseTo(expected[i], precision);
  }
}

function expectRectEncloses(
  actual: number[] | undefined,
  expected: number[],
  maxPadding: number,
): void {
  expect(actual).toBeDefined();
  expect(actual).toHaveLength(4);
  const [x1, y1, x2, y2] = actual!;
  expect(x1).toBeLessThanOrEqual(expected[0]);
  expect(x1).toBeGreaterThanOrEqual(expected[0] - maxPadding);
  expect(y1).toBeLessThanOrEqual(expected[1]);
  expect(y1).toBeGreaterThanOrEqual(expected[1] - maxPadding);
  expect(x2).toBeGreaterThanOrEqual(expected[2]);
  expect(x2).toBeLessThanOrEqual(expected[2] + maxPadding);
  expect(y2).toBeGreaterThanOrEqual(expected[3]);
  expect(y2).toBeLessThanOrEqual(expected[3] + maxPadding);
}

test("clearing all comments removes standalone comments and replies while preserving linked and uncommented annotations", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const sidebar = await openFixtureWithComments(page);

  await sidebar.getByPlaceholder("Search comments").fill("Imported free text");
  await expect(sidebar.locator("[data-comment-card]")).toHaveCount(1);

  await sidebar
    .locator(".sidebar-base__header")
    .getByRole("button", { name: "More actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Clear all comments", exact: true })
    .click();
  await confirmDialog(page, "Clear all comments?", "Clear all comments");

  await expect(sidebar.locator("[data-comment-card]")).toHaveCount(0);
  await sidebar.getByPlaceholder("Search comments").fill("");
  await expect(sidebar.locator("[data-comment-card]")).toHaveCount(0);

  // EmbedPDF splits bulk updates and deletions across worker commit batches
  // while Download invokes saveAsCopy without awaiting pending commits, so poll
  // until the settled annotation set is serialized into the exported PDF.
  let snapshot!: Awaited<ReturnType<typeof exportAnnotationSnapshot>>;
  await expect(async () => {
    snapshot = await exportAnnotationSnapshot(page);
    expect(
      snapshot.annotations.map((entry) => ({
        pageIndex: entry.pageIndex,
        id: entry.id,
        contents: entry.contents ?? "",
      })),
    ).toEqual(
      EXPECTED_AFTER_COMMENT_CLEAR.map(({ pageIndex, id }) => ({
        pageIndex,
        id,
        contents: "",
      })),
    );
  }).toPass({ timeout: 30_000 });

  expect(snapshot.title).toBe(DOCUMENT_TITLE);
  expect(snapshot.pageCount).toBe(PAGE_MARKERS.length);
  expect(
    snapshot.pageTexts.map((text) => text.replace(/\s+/g, " ").trim()),
  ).toEqual(PAGE_MARKERS);

  for (const expected of EXPECTED_AFTER_COMMENT_CLEAR) {
    const actual = snapshot.annotations.find(
      (entry) =>
        entry.pageIndex === expected.pageIndex && entry.id === expected.id,
    );
    expect(actual).toBeDefined();
    expect(actual!.subtype).toBe(expected.subtype);
    if (expected.preservedAuthor) {
      expect(actual!.author).toBe(expected.preservedAuthor);
      expect(actual!.contents).toBeUndefined();
    } else {
      expect(actual!.contents ?? "").toBe("");
    }
    if (expected.inkList) {
      // EmbedPDF pads an updated Ink annotation's /Rect by half its stroke width
      // while leaving /InkList unchanged.
      expectRectEncloses(actual!.rect, expected.rect, 2);
      expect(actual!.inkList).toHaveLength(expected.inkList.length);
      for (let i = 0; i < expected.inkList.length; i++) {
        expectNumbersClose(actual!.inkList![i], expected.inkList[i]);
      }
    } else {
      expectNumbersClose(actual!.rect, expected.rect);
    }
    if (expected.quadPoints) {
      expectNumbersClose(actual!.quadPoints, expected.quadPoints);
    }
  }
});

test("clearing all annotations removes comments and visual annotations across all pages", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const sidebar = await openFixtureWithComments(page);

  await page
    .locator('[data-sidebar="tool-panel"]')
    .getByRole("button", { name: "More actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Clear all annotations", exact: true })
    .click();
  await confirmDialog(page, "Clear all annotations?", "Clear all");
  await expect(
    page.getByText("All annotations cleared", { exact: true }),
  ).toBeVisible();
  await expect(sidebar.locator("[data-comment-card]")).toHaveCount(0);

  let snapshot!: Awaited<ReturnType<typeof exportAnnotationSnapshot>>;
  await expect(async () => {
    snapshot = await exportAnnotationSnapshot(page);
    expect(snapshot.annotations).toEqual([]);
  }).toPass({ timeout: 30_000 });

  expect(snapshot.title).toBe(DOCUMENT_TITLE);
  expect(snapshot.pageCount).toBe(PAGE_MARKERS.length);
  expect(
    snapshot.pageTexts.map((text) => text.replace(/\s+/g, " ").trim()),
  ).toEqual(PAGE_MARKERS);
});
