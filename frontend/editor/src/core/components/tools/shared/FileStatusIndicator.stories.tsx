import type { Meta, StoryObj } from "@storybook/react-vite";
import FileStatusIndicator from "@app/components/tools/shared/FileStatusIndicator";
import { AppProviders } from "@app/components/AppProviders";

const meta = {
  title: "Tools/Shared/FileStatusIndicator",
  component: FileStatusIndicator,
  // FileStatusIndicator reads openFilesModal/onFileUpload from FilesModalContext
  // and the workbench file list from FileContext, both only available inside the
  // full provider tree — mount that here with the network fetch + blocking gate
  // disabled so the story renders immediately.
  decorators: [
    (Story) => (
      <AppProviders
        appConfigProviderProps={{
          initialConfig: {},
          bootstrapMode: "non-blocking",
          autoFetch: false,
        }}
      >
        <Story />
      </AppProviders>
    ),
  ],
} satisfies Meta<typeof FileStatusIndicator>;
export default meta;

type Story = StoryObj<typeof meta>;

// With an empty workbench and no recent files, the indicator renders an
// "Upload" prompt regardless of the selectedFiles/minFiles props.
export const Default: Story = {
  args: {
    selectedFiles: [],
    minFiles: 1,
  },
};
