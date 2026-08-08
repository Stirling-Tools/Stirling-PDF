/**
 * What the file manager shows before anything has been added. The copy and
 * icons come from the file-action hooks, which desktop builds override — these
 * stories render the web wording.
 *
 * Only one context field is read (the upload click handler), so the fixture
 * supplies that alone rather than the whole provider.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import EmptyFilesState from "@app/components/fileManager/EmptyFilesState";
import {
  FileManagerContext,
  type FileManagerContextValue,
} from "@app/contexts/FileManagerContext";
import { PreferencesProvider } from "@app/contexts/PreferencesContext";

const meta: Meta<typeof EmptyFilesState> = {
  title: "FileManager/EmptyFilesState",
  component: EmptyFilesState,
  parameters: { layout: "fullscreen" },
  decorators: [
    // The wordmark resolves its logo variant through PreferencesContext, which
    // the Storybook preview does not mount, so this story supplies it.
    (Story) => (
      <PreferencesProvider>
        <FileManagerContext.Provider
          value={
            { onLocalFileClick: () => {} } as unknown as FileManagerContextValue
          }
        >
          <div style={{ height: "32rem" }}>
            <Story />
          </div>
        </FileManagerContext.Provider>
      </PreferencesProvider>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof EmptyFilesState>;

export const Default: Story = {};

/** The panel centres itself, so a short container crops rather than reflows. */
export const ShortContainer: Story = {
  decorators: [
    (Story) => (
      <div style={{ height: "18rem" }}>
        <Story />
      </div>
    ),
  ],
};

/** Narrow widths are the mobile case — the upload actions stack. */
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 360 }}>
        <Story />
      </div>
    ),
  ],
};
