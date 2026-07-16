import type { Meta, StoryObj } from "@storybook/react-vite";
import { FolderTreePanel } from "@app/components/filesPage/FolderTreePanel";
import { AppProviders } from "@app/components/AppProviders";
import { FilesPageProvider } from "@app/contexts/FilesPageContext";

// FolderTreePanel takes no data props of its own - folders, file counts, and
// the dialog callbacks all come from FilesPageContext/FolderContext, which
// lean on FileContext/AppConfigContext further up. The only way to exercise
// it is the same provider tree the app wraps around it (mirrors
// FileManagerView.stories.tsx).
const meta = {
  title: "FilesPage/FolderTreePanel",
  component: FolderTreePanel,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <AppProviders
        appConfigProviderProps={{
          initialConfig: {},
          bootstrapMode: "non-blocking",
          autoFetch: false,
        }}
      >
        <FilesPageProvider>
          <Story />
        </FilesPageProvider>
      </AppProviders>
    ),
  ],
} satisfies Meta<typeof FolderTreePanel>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Active panel - no folders yet in this IndexedDB instance. */
export const Default: Story = {
  args: {
    active: true,
  },
};

/** Inactive panel collapses to zero width and is hidden from a11y tree. */
export const Inactive: Story = {
  args: {
    active: false,
  },
};
