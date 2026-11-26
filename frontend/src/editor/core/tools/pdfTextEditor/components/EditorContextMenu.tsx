import { Fragment, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Menu } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "@editor/ui/Icon";
import { modShortcut } from "@editor/utils/hotkeys";
import { useToolbarController } from "@editor/tools/pdfTextEditor/hooks/useToolbarController";
import { InsertTextCommand } from "@editor/tools/pdfTextEditor/commands/InsertTextCommand";
import { pageViewHandlers } from "@editor/tools/pdfTextEditor/util/pageViewHandlers";
import { readShownImagePixels } from "@editor/tools/pdfTextEditor/util/imagePixels";
import { dispatchTableEdit } from "@editor/tools/pdfTextEditor/components/TableOverlay";
import {
  ModifyTableCommand,
  type TableOp,
} from "@editor/tools/pdfTextEditor/commands/ModifyTableCommand";
import { DisplayTransform } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import {
  isFocusInContentEditable,
  isModalOpen,
} from "@editor/tools/pdfTextEditor/util/dom";
import {
  editorContextMenu,
  useEditorContextMenu,
  type ContextMenuRequest,
  type PagePoint,
  type TableHit,
} from "@editor/tools/pdfTextEditor/store/contextMenu";
import { currentEditorSession } from "@editor/tools/pdfTextEditor/store/EditorSession";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { SelectionState } from "@editor/tools/pdfTextEditor/types";

interface Props {
  store: EditorStore;
  state: EditorViewState;
  selection: SelectionState;
}

const canReadClipboard = () =>
  typeof navigator !== "undefined" && !!navigator.clipboard?.readText;
const canWriteImages = () =>
  typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;

/** Where the menu key opens the menu: under the first selected object, with a paste point just below it. */
function keyboardRequest(
  state: EditorViewState,
  selection: SelectionState,
): ContextMenuRequest | null {
  const id = selection.runIds[0] ?? selection.imageIds[0];
  const prefix = selection.runIds[0] ? "pdf-editor-run-" : "pdf-editor-image-";
  const el = id
    ? document.querySelector(`[data-testid="${CSS.escape(prefix + id)}"]`)
    : null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  let at: PagePoint | null = null;
  for (const page of state.pages) {
    const item =
      page.runs.find((run) => run.id === id) ??
      page.images.find((image) => image.id === id);
    if (item) {
      at = {
        pageIndex: page.pageIndex,
        x: item.bounds.x,
        y: item.bounds.y - 16,
      };
      break;
    }
  }
  return { kind: "objects", clientX: r.left, clientY: r.bottom, at };
}

/**
 * The editor's right-click menu: the clipboard and Duplicate on a selection,
 * saving or externally editing an image, row and column edits in a table, Unlock
 * on a locked item, and adding at the clicked point on bare page. Everything
 * else stays in the selection bar. The menu key and Shift+F10 open it on the
 * selection.
 */
export function EditorContextMenu({ store, state, selection }: Props) {
  const request = useEditorContextMenu();

  useEffect(() => editorContextMenu.attachHost(), []);

  // A right press on something already selected keeps the whole selection for
  // the menu: each object's own press handling would select it alone, and a
  // text box would take focus.
  useEffect(() => {
    const keepSelection = (e: MouseEvent) => {
      if (e.button !== 2) return;
      const target = e.target as Element | null;
      if (!target?.closest("[data-viewer-pages]")) return;
      const sel = store.selection.value;
      const runId = target.closest<HTMLElement>("[data-run-id]")?.dataset.runId;
      const testId = target.closest<HTMLElement>(
        '[data-testid^="pdf-editor-image-"], [data-testid^="pdf-editor-shape-"]',
      )?.dataset.testid;
      const selected =
        (runId && sel.runIds.includes(runId)) ||
        (testId?.startsWith("pdf-editor-image-") &&
          sel.imageIds.includes(testId.slice("pdf-editor-image-".length))) ||
        (testId?.startsWith("pdf-editor-shape-") &&
          sel.shapeIds.includes(testId.slice("pdf-editor-shape-".length)));
      if (!selected) return;
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener("pointerdown", keepSelection, true);
    window.addEventListener("mousedown", keepSelection, true);
    return () => {
      window.removeEventListener("pointerdown", keepSelection, true);
      window.removeEventListener("mousedown", keepSelection, true);
    };
  }, [store]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const menuKey =
        e.key === "ContextMenu" || (e.shiftKey && e.key === "F10");
      if (!menuKey || isFocusInContentEditable() || isModalOpen()) return;
      const next = keyboardRequest(state, selection);
      if (!next) return;
      e.preventDefault();
      editorContextMenu.open(next);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state, selection]);

  // Escape closes only the menu: the editor's own Escape would also drop the
  // selection the menu was opened for.
  useEffect(() => {
    if (!request) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      editorContextMenu.close();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [request]);

  if (!request) return null;
  return (
    <ContextMenuBody
      // A right-click elsewhere while open is a new menu at the new point;
      // the open one would not follow its anchor there.
      key={`${request.kind}:${request.clientX}:${request.clientY}`}
      store={store}
      state={state}
      selection={selection}
      request={request}
    />
  );
}

function ContextMenuBody({
  store,
  state,
  selection,
  request,
}: Props & { request: ContextMenuRequest }) {
  const { t } = useTranslation();
  const controller = useToolbarController(store, state, selection);
  const close = () => editorContextMenu.close();
  const at = request.kind === "locked" ? null : request.at;

  const selectedText = () =>
    state.pages
      .flatMap((page) => page.runs)
      .filter((run) => selection.runIds.includes(run.id))
      .map((run) => run.text)
      .join("\n");
  const copy = async () => {
    const text = selectedText();
    if (text) await navigator.clipboard.writeText(text);
  };
  const pasteAt = async (point: PagePoint) => {
    const text = (await navigator.clipboard.readText()).replace(/\r\n?/g, "\n");
    if (!text) return;
    const cmd = new InsertTextCommand({ ...point, text });
    store.dispatch(cmd);
    if (cmd.insertedRunId) store.selection.selectOne(cmd.insertedRunId);
  };
  const addAt = (mode: "addText" | "addTable", point: PagePoint) => {
    store.setMode(mode);
    pageViewHandlers(store).onPageClick(point.pageIndex, point.x, point.y);
  };

  // The one image selected, which the image items act on.
  const imageId =
    selection.imageIds.length === 1 && selection.runIds.length === 0
      ? selection.imageIds[0]
      : null;
  const imagePng = async (id: string): Promise<Blob | null> => {
    const pageIndex = state.pages.find((p) =>
      p.images.some((image) => image.id === id),
    )?.pageIndex;
    const pixels =
      pageIndex === undefined
        ? null
        : readShownImagePixels(store, pageIndex, id);
    if (!pixels) return null;
    const canvas = document.createElement("canvas");
    canvas.width = pixels.width;
    canvas.height = pixels.height;
    canvas
      .getContext("2d")
      ?.putImageData(
        new ImageData(
          new Uint8ClampedArray(pixels.rgba),
          pixels.width,
          pixels.height,
        ),
        0,
        0,
      );
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  };
  const copyImage = async (id: string) => {
    const png = await imagePng(id);
    if (png)
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": png }),
      ]);
  };
  const saveImage = async (id: string) => {
    const png = await imagePng(id);
    if (!png) return;
    const url = URL.createObjectURL(png);
    const link = document.createElement("a");
    link.href = url;
    link.download = "image.png";
    link.click();
    URL.revokeObjectURL(url);
  };

  const item = (
    icon: IconName,
    label: string,
    onClick: () => void,
    testId: string,
    extra: { shortcut?: string; danger?: boolean; disabled?: boolean } = {},
  ): ReactNode => (
    <Menu.Item
      disabled={extra.disabled}
      leftSection={<Icon name={icon} size={18} />}
      rightSection={
        extra.shortcut ? (
          <span style={{ color: "var(--c-text-muted)", fontSize: "0.75rem" }}>
            {extra.shortcut}
          </span>
        ) : undefined
      }
      color={extra.danger ? "red" : undefined}
      onClick={onClick}
      data-testid={testId}
    >
      {label}
    </Menu.Item>
  );

  // Row and column edits at the cell the click landed in.
  const tableItems = (hit: TableHit): ReactNode => {
    const page = state.pages.find((p) => p.pageIndex === hit.pageIndex);
    const table = page?.tables?.find((tb) => tb.id === hit.tableId);
    if (!page || !table) return null;
    const edit = (op: TableOp, index: number) =>
      dispatchTableEdit(
        store,
        page,
        table,
        DisplayTransform.fromData(page.display),
        new ModifyTableCommand({ tableId: table.id, op, index }),
      );
    return (
      <>
        <Menu.Label>{t("pdfTextEditor.contextMenu.table", "Table")}</Menu.Label>
        {item(
          "between-horizontal-start",
          t("pdfTextEditor.contextMenu.insertRowAbove", "Insert row above"),
          () => edit("add-row", hit.row),
          "pdf-editor-context-row-above",
        )}
        {item(
          "between-horizontal-end",
          t("pdfTextEditor.contextMenu.insertRowBelow", "Insert row below"),
          () => edit("add-row", hit.row + 1),
          "pdf-editor-context-row-below",
        )}
        {item(
          "between-vertical-start",
          t("pdfTextEditor.contextMenu.insertColumnLeft", "Insert column left"),
          () => edit("add-col", hit.col),
          "pdf-editor-context-col-left",
        )}
        {item(
          "between-vertical-end",
          t(
            "pdfTextEditor.contextMenu.insertColumnRight",
            "Insert column right",
          ),
          () => edit("add-col", hit.col + 1),
          "pdf-editor-context-col-right",
        )}
        {item(
          "trash",
          t("pdfTextEditor.table.deleteRow", "Delete row"),
          () => edit("delete-row", hit.row),
          "pdf-editor-context-row-delete",
          { disabled: table.rows < 2 },
        )}
        {item(
          "trash",
          t("pdfTextEditor.table.deleteColumn", "Delete column"),
          () => edit("delete-col", hit.col),
          "pdf-editor-context-col-delete",
          { disabled: table.cols < 2 },
        )}
      </>
    );
  };

  // Every menu is built from the same groups, in the same order and under the
  // same names, so a control sits in one place whatever was right-clicked:
  // clipboard, then Duplicate, then what is particular to the target, then
  // Unlock. Empty groups drop out with their dividers.
  const { hasRunSelection, selectionCount } = controller;
  const objects = request.kind === "objects";
  const onBarePage = request.kind === "page" && !request.table;
  const clipboard: ReactNode[] = [];
  const duplicate: ReactNode[] = [];
  const particular: ReactNode[] = [];
  const unlock: ReactNode[] = [];

  if (objects && hasRunSelection) {
    clipboard.push(
      item(
        "scissors",
        t("pdfTextEditor.contextMenu.cut", "Cut"),
        () => void copy().then(() => controller.onDelete()),
        "pdf-editor-context-cut",
        { shortcut: modShortcut("X") },
      ),
      item(
        "copy",
        t("pdfTextEditor.contextMenu.copy", "Copy"),
        () => void copy(),
        "pdf-editor-context-copy",
        { shortcut: modShortcut("C") },
      ),
    );
  }
  if (objects && imageId && canWriteImages()) {
    clipboard.push(
      item(
        "copy",
        t("pdfTextEditor.contextMenu.copy", "Copy"),
        () => void copyImage(imageId),
        "pdf-editor-context-copy-image",
      ),
    );
  }
  if (at && canReadClipboard()) {
    clipboard.push(
      item(
        "clipboard",
        t("pdfTextEditor.contextMenu.paste", "Paste"),
        () => void pasteAt(at),
        "pdf-editor-context-paste",
        { shortcut: modShortcut("V") },
      ),
    );
  }
  if (objects && selectionCount === 1 && (hasRunSelection || imageId)) {
    duplicate.push(
      item(
        "copy-plus",
        t("pdfTextEditor.toolbar.duplicate", "Duplicate"),
        controller.onDuplicate,
        "pdf-editor-context-duplicate",
        { shortcut: modShortcut("D") },
      ),
    );
  }
  if (objects && imageId) {
    particular.push(
      item(
        "download",
        t("pdfTextEditor.contextMenu.saveImage", "Save image"),
        () => void saveImage(imageId),
        "pdf-editor-context-save-image",
      ),
    );
    if (controller.externalEditSupported) {
      particular.push(
        item(
          "external-link",
          t("pdfTextEditor.toolbar.editImageExternally", "Edit in another app"),
          controller.onEditImageExternally,
          "pdf-editor-context-edit-externally",
        ),
      );
    }
  }
  if (onBarePage && at) {
    particular.push(
      item(
        "type",
        t("pdfTextEditor.contextMenu.addTextHere", "Add text here"),
        () => addAt("addText", at),
        "pdf-editor-context-add-text",
      ),
      item(
        "table",
        t("pdfTextEditor.contextMenu.addTableHere", "Add table here"),
        () => addAt("addTable", at),
        "pdf-editor-context-add-table",
      ),
      item(
        "image",
        t("pdfTextEditor.contextMenu.addImageHere", "Add image here"),
        () => currentEditorSession()?.pickImage(at),
        "pdf-editor-context-add-image",
      ),
    );
  }
  if (request.kind !== "locked" && request.table) {
    particular.push(tableItems(request.table));
  }
  if (request.kind === "locked") {
    unlock.push(
      item(
        "lock-open",
        t("pdfTextEditor.contextMenu.unlock", "Unlock"),
        () =>
          pageViewHandlers(store).onUnlock(request.pageIndex, request.target),
        "pdf-editor-context-unlock",
      ),
    );
  }

  const groups = [clipboard, duplicate, particular, unlock].filter(
    (group) => group.length > 0,
  );
  const empty = groups.length === 0;
  const items = groups.map((group, i) => (
    <Fragment key={i}>
      {i > 0 && <Menu.Divider />}
      {group.map((node, j) => (
        <Fragment key={j}>{node}</Fragment>
      ))}
    </Fragment>
  ));

  useEffect(() => {
    if (empty) editorContextMenu.close();
  }, [empty]);
  if (empty) return null;

  // Portalled: the viewer's paint containment would otherwise make the
  // anchor's fixed position relative to the viewer rather than the window.
  return createPortal(
    <Menu
      opened
      onClose={close}
      position="bottom-start"
      offset={2}
      width={240}
      shadow="md"
      withinPortal
      closeOnItemClick
    >
      <Menu.Target>
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: request.clientX,
            top: request.clientY,
            width: 0,
            height: 0,
          }}
        />
      </Menu.Target>
      <Menu.Dropdown data-testid="pdf-editor-context-menu">
        {items}
      </Menu.Dropdown>
    </Menu>,
    document.body,
  );
}
