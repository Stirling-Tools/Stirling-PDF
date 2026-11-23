import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  getPdfiumModule,
  readEffectivePageBox,
} from "@editor/services/pdfiumService";
import {
  closeCopy,
  openCopy,
  saveRewritten,
  withFloats,
} from "@editor/tools/pdfTextEditor/util/pdfiumCopy";
import { PAGE_SIZES } from "@editor/constants/pageSizeConstants";
import { carryCopiedPageFormats } from "@editor/tools/pdfTextEditor/util/carriedFormats";
import i18n from "i18next";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";

export type PageSizeName = keyof typeof PAGE_SIZES;
export type PageOrientation = "portrait" | "landscape";

export type DocumentChange =
  | { kind: "addPage"; after: number }
  | { kind: "duplicatePage"; page: number }
  | { kind: "deletePage"; page: number }
  | {
      kind: "pageSetup";
      pages: "all" | number;
      size: PageSizeName | "current";
      inView?: number;
      orientation: PageOrientation;
    };

export type RefusalReason = "lastPage" | "saving";

export class DocumentChangeRefused extends Error {
  constructor(readonly reason: RefusalReason) {
    super(reason);
  }
}

export interface PageChange {
  command: Command;
  focusPage: number;
}

export function pageChangeCommand(
  doc: EditorDocument,
  change: DocumentChange,
): PageChange {
  if (doc.saving) throw new DocumentChangeRefused("saving");
  const order = doc.displayOrder();
  const m = doc.module;
  switch (change.kind) {
    case "addPage": {
      const after = doc.page(change.after);
      const index = doc.appendBlankPage(after.width, after.height);
      return {
        command: new PageOrderCommand(
          insertedAfter(order, change.after, index),
          index,
          "add",
        ),
        focusPage: index,
      };
    }
    case "duplicatePage": {
      const source = doc.page(change.page);
      if (source.dirty) source.markNeedsGenerate();
      source.flushGenerate(m);
      const index = doc.appendCopyFrom(doc.docPtr, change.page);
      carryCopiedPageFormats(doc, change.page, index);
      return {
        command: new PageOrderCommand(
          insertedAfter(order, change.page, index),
          index,
          "duplicate",
        ),
        focusPage: index,
      };
    }
    case "deletePage": {
      if (order.length <= 1) throw new DocumentChangeRefused("lastPage");
      const at = order.indexOf(change.page);
      const next = order.filter((index) => index !== change.page);
      return {
        command: new PageOrderCommand(next, null, "delete"),
        focusPage: next[Math.min(Math.max(at, 0), next.length - 1)],
      };
    }
    case "pageSetup": {
      const pages = change.pages === "all" ? [...order] : [change.pages];
      return {
        command: new PageSetupCommand(pages, change.size, change.orientation),
        focusPage:
          change.pages === "all" ? (change.inView ?? order[0]) : change.pages,
      };
    }
  }
}

function insertedAfter(
  order: readonly number[],
  after: number,
  index: number,
): number[] {
  const at = order.indexOf(after);
  return [...order.slice(0, at + 1), index, ...order.slice(at + 1)];
}

class PageOrderCommand implements Command {
  readonly type = "page-order";
  private prev: number[] | null = null;

  constructor(
    private readonly next: number[],
    private readonly added: number | null,
    private readonly kind: "add" | "duplicate" | "delete",
  ) {}

  apply(doc: EditorDocument): void {
    this.prev = [...doc.displayOrder()];
    doc.setDisplayOrder(this.next);
    if (this.added !== null) doc.page(this.added).bumpRevision();
  }

  revert(doc: EditorDocument): void {
    if (this.prev) doc.setDisplayOrder(this.prev);
  }

  describe(): string {
    if (this.kind === "add")
      return i18n.t("pdfTextEditor.commands.addPage", "Add page");
    if (this.kind === "duplicate")
      return i18n.t("pdfTextEditor.commands.duplicatePage", "Duplicate page");
    return i18n.t("pdfTextEditor.commands.deletePage", "Delete page");
  }
}

type Rect = [number, number, number, number];

interface PageBoxes {
  index: number;
  boxes: Array<Rect | null>;
  shown: Rect;
}

const BOX_KINDS = ["Media", "Crop", "Trim", "Bleed", "Art"] as const;

function boxAccess(m: WrappedPdfiumModule, kind: (typeof BOX_KINDS)[number]) {
  return {
    get: m[`FPDFPage_Get${kind}Box`],
    set: m[`FPDFPage_Set${kind}Box`],
  };
}

function readBoxes(m: WrappedPdfiumModule, pagePtr: number) {
  return withFloats(m, 4, (rect) =>
    BOX_KINDS.map((kind) => {
      if (!boxAccess(m, kind).get(pagePtr, rect, rect + 4, rect + 8, rect + 12))
        return null;
      return [0, 4, 8, 12].map((o) => m.pdfium.getValue(rect + o, "float")) as [
        number,
        number,
        number,
        number,
      ];
    }),
  );
}

class PageSetupCommand implements Command {
  readonly type = "page-setup";
  private prev: PageBoxes[] = [];

  constructor(
    private readonly pages: number[],
    private readonly size: PageSizeName | "current",
    private readonly orientation: PageOrientation,
  ) {}

  apply(doc: EditorDocument): void {
    const m = doc.module;
    this.prev = this.pages.map((index) => {
      const page = doc.page(index);
      const boxes = readBoxes(m, page.pagePtr);
      const visible = visibleBox(m, page.pagePtr);
      const shown: Rect = [
        visible.left,
        visible.bottom,
        visible.right,
        visible.top,
      ];
      const { width, height } = paperOf(m, page.pagePtr, this.size);
      const [w, h] =
        this.orientation === "landscape"
          ? [Math.max(width, height), Math.min(width, height)]
          : [Math.min(width, height), Math.max(width, height)];
      const turned = m.FPDFPage_GetRotation(page.pagePtr) % 2 === 1;
      resizeKeepingTopLeft(m, page.pagePtr, turned ? h : w, turned ? w : h);
      doc.noteResized(index);
      return { index, boxes, shown };
    });
  }

  revert(doc: EditorDocument): void {
    const m = doc.module;
    for (const { index, boxes, shown } of this.prev) {
      const page = doc.page(index);
      const media = boxes[0] ?? shown;
      boxes.forEach((box, i) => {
        const set = box ?? (i <= 1 ? media : null);
        if (set) boxAccess(m, BOX_KINDS[i]).set(page.pagePtr, ...set);
      });
      doc.noteResized(index);
    }
  }

  describe(): string {
    return i18n.t("pdfTextEditor.commands.pageSetup", "Page setup");
  }
}

export async function writeDisplayOrder(
  bytes: Uint8Array,
  order: readonly number[],
): Promise<Uint8Array> {
  const m = await getPdfiumModule();
  const open = openCopy(m, bytes);
  let out: Uint8Array;
  try {
    const count = m.FPDF_GetPageCount(open.docPtr);
    const kept = new Set(order);
    for (let i = count - 1; i >= 0; i--)
      if (!kept.has(i)) m.FPDFPage_Delete(open.docPtr, i);
    const survivors = Array.from({ length: count }, (_, i) => i).filter((i) =>
      kept.has(i),
    );
    const moved = order.map((index) => survivors.indexOf(index));
    if (moved.some((at, i) => at !== i)) {
      const list = m.pdfium.wasmExports.malloc(moved.length * 4);
      try {
        moved.forEach((at, i) => m.pdfium.setValue(list + i * 4, at, "i32"));
        if (!m.FPDF_MovePages(open.docPtr, list, moved.length, 0))
          throw new Error("PDFium could not reorder the pages");
      } finally {
        m.pdfium.wasmExports.free(list);
      }
    }
    out = saveRewritten(m, open.docPtr);
  } finally {
    closeCopy(m, open);
  }
  return out;
}

function paperOf(
  m: WrappedPdfiumModule,
  pagePtr: number,
  size: PageSizeName | "current",
): { width: number; height: number } {
  if (size !== "current") return PAGE_SIZES[size];
  const box = visibleBox(m, pagePtr);
  return { width: box.right - box.left, height: box.top - box.bottom };
}

function visibleBox(m: WrappedPdfiumModule, pagePtr: number) {
  const box = withFloats(m, 4, (rect) =>
    m.FPDF_GetPageBoundingBox(pagePtr, rect)
      ? [0, 4, 8, 12].map((o) => m.pdfium.getValue(rect + o, "float"))
      : null,
  );
  if (!box) return readEffectivePageBox(m, pagePtr);
  const [a, b, c, d] = box;
  return {
    left: Math.min(a, c),
    right: Math.max(a, c),
    bottom: Math.min(b, d),
    top: Math.max(b, d),
  };
}

function resizeKeepingTopLeft(
  m: WrappedPdfiumModule,
  pagePtr: number,
  width: number,
  height: number,
) {
  const box = visibleBox(m, pagePtr);
  const left = [box.left, box.left, box.right - width, box.right - width];
  const bottom = [box.top - height, box.bottom, box.bottom, box.top - height];
  const quarter = ((m.FPDFPage_GetRotation(pagePtr) % 4) + 4) % 4;
  const x = left[quarter];
  const y = bottom[quarter];
  m.FPDFPage_SetMediaBox(pagePtr, x, y, x + width, y + height);
  m.FPDFPage_SetCropBox(pagePtr, x, y, x + width, y + height);
  const boxes = [
    [m.FPDFPage_GetTrimBox, m.FPDFPage_SetTrimBox],
    [m.FPDFPage_GetBleedBox, m.FPDFPage_SetBleedBox],
    [m.FPDFPage_GetArtBox, m.FPDFPage_SetArtBox],
  ] as const;
  withFloats(m, 4, (rect) => {
    for (const [get, set] of boxes)
      if (get(pagePtr, rect, rect + 4, rect + 8, rect + 12))
        set(pagePtr, x, y, x + width, y + height);
  });
}
