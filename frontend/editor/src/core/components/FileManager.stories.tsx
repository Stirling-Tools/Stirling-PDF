import { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import FileManager from "@app/components/FileManager";
import { AppProviders } from "@app/components/AppProviders";
import { useFilesModalContext } from "@app/contexts/FilesModalContext";

// FileManager reads everything it needs (open/close state, upload + recent-file
// handlers, app config, active file ids) from context rather than props, so the
// only way to exercise it in isolation is the same provider tree the app itself
// wraps around it.
function OpenFilesModalOnMount({ children }: { children: React.ReactNode }) {
  const { openFilesModal } = useFilesModalContext();
  useEffect(() => {
    openFilesModal();
  }, [openFilesModal]);
  return <>{children}</>;
}

const meta = {
  title: "Components/FileManager",
  component: FileManager,
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
        <OpenFilesModalOnMount>
          <Story />
        </OpenFilesModalOnMount>
      </AppProviders>
    ),
  ],
} satisfies Meta<typeof FileManager>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    selectedTool: null,
  },
};

export const RestrictedToImages: Story = {
  args: {
    selectedTool: { supportedFormats: ["png", "jpg", "jpeg"] },
  },
};
