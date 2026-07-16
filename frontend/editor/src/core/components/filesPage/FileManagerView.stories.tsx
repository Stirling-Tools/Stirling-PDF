import type { Meta, StoryObj } from "@storybook/react-vite";
import FileManagerView from "@app/components/filesPage/FileManagerView";
import { AppProviders } from "@app/components/AppProviders";
import { FilesPageProvider } from "@app/contexts/FilesPageContext";

// FileManagerView takes no props at all - every bit of state (files, folders,
// selection, dialogs) comes from FilesPageContext, which itself leans on
// FileContext/FolderContext/AppConfigContext. The only way to exercise it is
// the same provider tree the app wraps around it (mirrors FileManager.stories.tsx).
const meta = {
  title: "FilesPage/FileManagerView",
  component: FileManagerView,
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
} satisfies Meta<typeof FileManagerView>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Empty file manager - no files uploaded yet in this IndexedDB instance. */
export const Default: Story = {};
