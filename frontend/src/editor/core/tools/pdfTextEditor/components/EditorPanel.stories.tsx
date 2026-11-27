import { useEffect, useMemo } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box } from "@mantine/core";
import { EditorSidebar } from "@editor/tools/pdfTextEditor/components/EditorSidebar";
import { EditorPanelActions } from "@editor/tools/pdfTextEditor/components/EditorPanelActions";
import type { EditorViewState } from "@editor/tools/pdfTextEditor/store/EditorStore";
import {
  clearEditorSession,
  setEditorSession,
  type EditorSession,
} from "@editor/tools/pdfTextEditor/store/EditorSession";
import {
  storyState,
  storyStore,
} from "@editor/tools/pdfTextEditor/components/editorStorySupport";

/**
 * The editor's side panel on desktop: the insert row at its head, the
 * document's fonts, colours and settings, and undo, redo and Save pinned to
 * its foot. The selection's own controls live in the floating bar, not here.
 */
function EditorPanelDemo({
  mode = "select",
  dirty = false,
}: {
  mode?: EditorViewState["mode"];
  dirty?: boolean;
}) {
  const store = useMemo(() => storyStore(), []);
  // Image waits on a session, which the editor sets once a file is open.
  useEffect(() => {
    const noop = () => {};
    const session: EditorSession = {
      fileName: "report.pdf",
      save: noop,
      autosave: noop,
      download: noop,
      pickImage: noop,
      revealPage: noop,
      mergeSelection: noop,
      ungroupSelection: noop,
      changeDocument: async () => {},
      pageSize: () => ({ width: 612, height: 792 }),
    };
    setEditorSession(session);
    return () => clearEditorSession(session);
  }, []);
  const state = { ...storyState(store), mode, dirty };
  return (
    <Box
      w={320}
      h={620}
      style={{
        display: "flex",
        flexDirection: "column",
        border: "1px solid var(--c-border-subtle)",
        background: "var(--c-bg-raised)",
      }}
    >
      <Box style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <EditorSidebar
          store={store}
          state={state}
          selection={store.selection.value}
          desktop
          canGroup={false}
          canUngroup={false}
          onGroup={() => {}}
          onUngroup={() => {}}
          onSetGroupingMode={() => {}}
          onSetWidthMode={() => {}}
          onSetShowRulers={() => {}}
          onRunOcr={() => {}}
          ocrRunning={false}
          ocrAvailable={null}
          ocrBlockedReason={null}
        />
      </Box>
      <EditorPanelActions
        store={store}
        compact={false}
        dirty={dirty}
        onSave={() => {}}
        onDownload={() => {}}
        onOpenFind={() => {}}
        onShowHelp={() => {}}
      />
    </Box>
  );
}

const meta: Meta<typeof EditorPanelDemo> = {
  title: "Text editor/Side panel",
  component: EditorPanelDemo,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Text is armed: the next click on the page adds a text box. */
export const TextArmed: Story = { args: { mode: "addText" } };

/** Save is live only once there are unsaved edits. */
export const Unsaved: Story = { args: { dirty: true } };

/**
 * Phones have no floating selection bar, so their details sheet keeps the
 * selection's position, size and paragraph controls above the document.
 */
function PhoneDetailsDemo() {
  const store = useMemo(() => storyStore({ runIds: ["r2"] }), []);
  const state = storyState(store, { paragraph: true });
  return (
    <Box
      w={360}
      style={{
        border: "1px solid var(--c-border-subtle)",
        background: "var(--c-bg-raised)",
      }}
    >
      <EditorSidebar
        store={store}
        state={state}
        selection={store.selection.value}
        canGroup={false}
        canUngroup
        onGroup={() => {}}
        onUngroup={() => {}}
        onSetGroupingMode={() => {}}
        onSetWidthMode={() => {}}
        onSetShowRulers={() => {}}
        onRunOcr={() => {}}
        ocrRunning={false}
        ocrAvailable={null}
        ocrBlockedReason={null}
      />
    </Box>
  );
}

/** The phone details sheet's contents with a text box selected. */
export const PhoneDetails: Story = { render: () => <PhoneDetailsDemo /> };
