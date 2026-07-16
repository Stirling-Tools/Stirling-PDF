import type { Meta, StoryObj, Decorator } from "@storybook/react-vite";
import { ScopedOperationButton } from "@app/components/tools/shared/ScopedOperationButton";
import { AppProviders } from "@app/components/AppProviders";
import { createStirlingFile } from "@app/types/fileContext";

// ScopedOperationButton reads the workbench file list via useAllFiles,
// useViewer, and useNavigationState — only available inside the full
// provider tree. Mount that here with the network fetch + blocking gate
// disabled so the story renders immediately.
const withProviders: Decorator = (Story) => (
  <AppProviders
    appConfigProviderProps={{
      initialConfig: {},
      bootstrapMode: "non-blocking",
      autoFetch: false,
    }}
  >
    <Story />
  </AppProviders>
);

const mockFile = createStirlingFile(
  new File(["%PDF-1.4"], "document.pdf", { type: "application/pdf" }),
);
const mockFileTwo = createStirlingFile(
  new File(["%PDF-1.4"], "second.pdf", { type: "application/pdf" }),
);

const meta = {
  title: "Tools/Shared/ScopedOperationButton",
  component: ScopedOperationButton,
  decorators: [withProviders],
} satisfies Meta<typeof ScopedOperationButton>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    selectedFiles: [mockFile],
    submitText: "Convert",
  },
};

// With no files loaded in the workbench, the multi-file hint reflects the
// selectedFiles prop directly: "(2 files)" appended to the button text.
export const MultipleFilesSelected: Story = {
  args: {
    selectedFiles: [mockFile, mockFileTwo],
    submitText: "Merge",
  },
};

export const Disabled: Story = {
  args: {
    selectedFiles: [],
    submitText: "Convert",
    disabled: true,
    disabledReason: "noFiles",
  },
};
