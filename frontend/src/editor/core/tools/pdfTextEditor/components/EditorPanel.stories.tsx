import { useEffect, useMemo } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box } from "@mantine/core";
import { EditorPanelTools } from "@editor/tools/pdfTextEditor/components/EditorPanelTools";
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
 * The editor's side panel frame: the insert row at its head, and undo, redo
 * and Save pinned to its foot however little sits between them.
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
    };
    setEditorSession(session);
    return () => clearEditorSession(session);
  }, []);
  const state = { ...storyState(store), mode, dirty };
  return (
    <Box
      w={320}
      h={480}
      style={{
        display: "flex",
        flexDirection: "column",
        border: "1px solid var(--c-border-subtle)",
        background: "var(--c-bg-raised)",
      }}
    >
      <EditorPanelTools store={store} state={state} />
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

/** Unsaved edits put a dot on Save. */
export const Unsaved: Story = { args: { dirty: true } };
