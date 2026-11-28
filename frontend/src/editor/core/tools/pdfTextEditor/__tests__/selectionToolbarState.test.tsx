import { MantineProvider } from "@mantine/core";
import { act, render, renderHook, screen } from "@testing-library/react";
import { beforeAll, expect, test, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@editor/services/apiClient", () => ({ default: { get } }));

import { FormatGroup } from "@editor/tools/pdfTextEditor/components/toolbar/FormatGroup";
import { StyleTextRangeCommand } from "@editor/tools/pdfTextEditor/commands/StyleTextRangeCommand";
import { useToolbarController } from "@editor/tools/pdfTextEditor/hooks/useToolbarController";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { PageSnapshot } from "@editor/tools/pdfTextEditor/types";
import {
  editorStores,
  servePdfiumWasm,
} from "@editor/tools/pdfTextEditor/__tests__/editorStores";

servePdfiumWasm();
const { fixture } = editorStores();

beforeAll(() => {
  get.mockRejectedValue(new Error("no server fonts"));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

/** tagged-sample.pdf with "every" redrawn in Helvetica-Bold and "region" in Times-Roman. */
async function styledLine(): Promise<{ store: EditorStore; run: TextRun }> {
  const store = await fixture("tagged-sample.pdf");
  // A revision no page has, so the first dispatch publishes the page as read.
  store.publishPages([
    {
      pageIndex: 0,
      revision: -1,
      runs: [],
      images: [],
      shapes: [],
      annotations: [],
      rules: [],
    } as unknown as PageSnapshot,
  ]);
  const run = store
    .document!.page(0)
    .runs.find((r) => r.text.startsWith("Revenue"))!;
  const at = (word: string) => run.text.indexOf(word);
  store.dispatch(
    new StyleTextRangeCommand({
      pageIndex: 0,
      runId: run.id,
      faces: [
        { start: at("every"), end: at("every") + 5, face: "Helvetica-Bold" },
        { start: at("region"), end: at("region") + 6, face: "Times-Roman" },
      ],
    }),
  );
  return { store, run };
}

function select(store: EditorStore, run: TextRun, part: string | null): void {
  store.selection.selectOne(run.id);
  if (part === null) return;
  const start = run.text.indexOf(part);
  store.selection.setTextRange(run.id, { start, end: start + part.length });
}

function toolbar(store: EditorStore) {
  return renderHook(() =>
    useToolbarController(store, store.getState(), store.selection.value),
  ).result.current.state;
}

test("Bold reads on for a selected bold word inside a regular box", async () => {
  const { store, run } = await styledLine();
  select(store, run, "every");

  const state = toolbar(store);

  expect(state.bold).toBe(true);
  expect(state.mixed.bold).toBe(false);
  expect(state.weight).toBe(700);
  expect(state.fontFamily).toMatch(/Helvetica-Bold$/);
});

test("Bold reads mixed for a selection of bold and regular words of one family, which is not a mixed family", async () => {
  const { store, run } = await styledLine();
  select(store, run, "in every");

  const state = toolbar(store);

  expect(state.bold).toBe(false);
  expect(state.mixed.bold).toBe(true);
  expect(state.weight).toBeNull();
  expect(state.mixed.fontFamily).toBe(false);
});

test("the family reads as the selected words' own, and as mixed when they differ", async () => {
  const { store, run } = await styledLine();
  select(store, run, "region");
  expect(toolbar(store).fontFamily).toMatch(/Times-Roman$/);
  expect(toolbar(store).mixed.fontFamily).toBe(false);

  select(store, run, "every region");
  expect(toolbar(store).mixed.fontFamily).toBe(true);
});

test("with no characters selected the controls describe the box", async () => {
  const { store, run } = await styledLine();
  select(store, run, null);

  const state = toolbar(store);

  expect(state.bold).toBe(false);
  expect(state.mixed.bold).toBe(false);
  expect(state.fontFamily).toBe(run.fontId);
});

function Toolbar({ store }: { store: EditorStore }) {
  const controller = useToolbarController(
    store,
    store.getState(),
    store.selection.value,
  );
  return <FormatGroup controller={controller} />;
}

function renderToolbar(store: EditorStore) {
  return render(
    <MantineProvider env="test">
      <Toolbar store={store} />
    </MantineProvider>,
  );
}

test("the Bold toggle and family field show a selection of mixed words as mixed", async () => {
  const { store, run } = await styledLine();
  select(store, run, "every region");

  renderToolbar(store);

  expect(screen.getByTestId("pdf-editor-bold")).toHaveAttribute(
    "aria-pressed",
    "mixed",
  );
  expect(screen.getByTestId("pdf-editor-font-family")).toHaveAttribute(
    "placeholder",
    "pdfTextEditor.fontPicker.mixed",
  );
});

test("the Bold toggle shows on for a bold word and off for a regular one beside it", async () => {
  const { store, run } = await styledLine();
  select(store, run, "every");
  const { unmount } = renderToolbar(store);
  expect(screen.getByTestId("pdf-editor-bold")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  unmount();

  act(() => select(store, run, "grew"));
  renderToolbar(store);
  expect(screen.getByTestId("pdf-editor-bold")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
