import { expect, test } from "vitest";
import {
  InsertShapeCommand,
  ReshapeCommand,
} from "@editor/tools/pdfTextEditor/commands/shapeCommands";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import {
  editorStores,
  savedBytes,
  servePdfiumWasm,
} from "@editor/tools/pdfTextEditor/__tests__/editorStores";

servePdfiumWasm();
const { fixture } = editorStores();

const PATH_OBJECT = 2;

function pathCount(doc: EditorDocument): number {
  const m = doc.module;
  const page = doc.page(0);
  let paths = 0;
  for (let i = 0; i < m.FPDFPage_CountObjects(page.pagePtr); i++) {
    if (
      m.FPDFPageObj_GetType(m.FPDFPage_GetObject(page.pagePtr, i)) ===
      PATH_OBJECT
    )
      paths++;
  }
  return paths;
}

test("a drawn box is saved into the page, resized in place and undone", async () => {
  const store = await fixture("paragraph-sample.pdf");
  const doc = store.document!;
  const before = pathCount(doc);
  const insert = new InsertShapeCommand({
    pageIndex: 0,
    kind: "box",
    x: 40,
    y: 200,
  });
  store.dispatch(insert);
  const id = insert.insertedShapeId!;
  expect(pathCount(doc)).toBe(before + 1);

  store.dispatch(
    new ReshapeCommand({
      pageIndex: 0,
      shapeId: id,
      bounds: { x: 40, y: 60, width: 300, height: 140 },
      fill: { r: 200, g: 30, b: 30, a: 255 },
    }),
  );
  const shape = doc.page(0).findShape(id)!;
  expect(shape.bounds).toMatchObject({ width: 300, height: 140 });
  expect(shape.drawn?.fill).toMatchObject({ r: 200 });
  expect(pathCount(doc)).toBe(before + 1);

  const reopened = await EditorDocument.open(await savedBytes(store));
  try {
    PdfiumTextReader.populate(reopened, reopened.page(0));
    expect(pathCount(reopened)).toBe(before + 1);
  } finally {
    reopened.dispose();
  }

  store.undo();
  expect(doc.page(0).findShape(id)?.bounds).toMatchObject({
    width: 160,
    height: 100,
  });
  store.undo();
  expect(doc.page(0).findShape(id)).toBeUndefined();
  expect(pathCount(doc)).toBe(before);
});

test("resizing keeps a shape's top edge put, even when the size is clamped", async () => {
  const store = await fixture("paragraph-sample.pdf");
  const doc = store.document!;
  const line = new InsertShapeCommand({
    pageIndex: 0,
    kind: "line",
    x: 40,
    y: 200,
  });
  store.dispatch(line);
  const lineShape = doc.page(0).findShape(line.insertedShapeId!)!;
  const lineTop = lineShape.bounds.y + lineShape.bounds.height;
  store.dispatch(
    new ReshapeCommand({
      pageIndex: 0,
      shapeId: lineShape.id,
      bounds: {
        x: 40,
        y: lineShape.bounds.y - 30,
        width: 260,
        height: lineShape.bounds.height + 30,
      },
    }),
  );
  expect(lineShape.bounds.y + lineShape.bounds.height).toBeCloseTo(lineTop);
  expect(lineShape.bounds.width).toBe(260);

  const box = new InsertShapeCommand({
    pageIndex: 0,
    kind: "box",
    x: 40,
    y: 150,
  });
  store.dispatch(box);
  const boxShape = doc.page(0).findShape(box.insertedShapeId!)!;
  const boxTop = boxShape.bounds.y + boxShape.bounds.height;
  store.dispatch(
    new ReshapeCommand({
      pageIndex: 0,
      shapeId: boxShape.id,
      bounds: { x: 40, y: boxTop - 1, width: 1, height: 1 },
    }),
  );
  expect(boxShape.bounds.y + boxShape.bounds.height).toBeCloseTo(boxTop);
  expect(boxShape.bounds.height).toBe(4);
});

test("a shape placed by the page's corner is kept on the page", async () => {
  const store = await fixture("paragraph-sample.pdf");
  const page = store.document!.page(0);
  const { cropRight, cropBottom } = page.display;
  const box = new InsertShapeCommand({
    pageIndex: 0,
    kind: "box",
    x: cropRight - 5,
    y: cropBottom + 5,
  });
  store.dispatch(box);

  const { bounds } = page.shapes.find((s) => s.id === box.insertedShapeId)!;
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(cropRight);
  expect(bounds.y).toBeGreaterThanOrEqual(cropBottom);
});
