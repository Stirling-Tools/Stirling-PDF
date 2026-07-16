import type { Meta, StoryObj } from "@storybook/react-vite";
import FileSidebar from "@app/components/shared/FileSidebar";
import { AppProviders } from "@app/components/AppProviders";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";

const meta = {
  title: "Shared/FileSidebar",
  component: FileSidebar,
  parameters: { layout: "fullscreen" },
  // FileSidebar reads file/navigation/viewer/tool-workflow/app-config state
  // directly (useFileState, useNavigationState, useViewer, useToolWorkflow,
  // useAppConfig, useIndexedDB via FileContextProvider), so it needs the same
  // provider stack AppProviders.tsx sets up around it in the real app.
  decorators: [
    (Story) => (
      <AppProviders
        appConfigProviderProps={{
          initialConfig: {},
          bootstrapMode: "non-blocking",
          autoFetch: false,
        }}
      >
        <div style={{ height: "37.5rem" }}>
          <Story />
        </div>
      </AppProviders>
    ),
  ],
} satisfies Meta<typeof FileSidebar>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onToggleCollapse: () => {},
    onOpenSettings: () => {},
  },
};

export const Collapsed: Story = {
  args: {
    ...Default.args,
    collapsed: true,
  },
};

/** Extra action row rendered under "Open from computer" (e.g. a "New folder" entry). */
export const WithExtraAction: Story = {
  args: {
    ...Default.args,
    extraAction: {
      icon: <CreateNewFolderIcon />,
      label: "New folder",
      onClick: () => {},
    },
  },
};
