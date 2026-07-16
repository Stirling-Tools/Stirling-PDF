import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileSelectorPicker } from "@app/components/shared/FileSelectorPicker";
import { FileContextProvider } from "@app/contexts/FileContext";

/**
 * Reads from FileContext (workbench files) and IndexedDBContext (persisted
 * saved files) further up the tree — neither is part of the shared preview
 * decorators, so FileContextProvider (which also wraps IndexedDBProvider) is
 * stood up here. The popover starts closed, so no IndexedDB read happens
 * until a story interacts with it.
 */
function withFileContext(Story: () => JSX.Element) {
  return (
    <FileContextProvider>
      <div style={{ maxWidth: "16rem" }}>
        <Story />
      </div>
    </FileContextProvider>
  );
}

const meta = {
  title: "Shared/FileSelectorPicker",
  component: FileSelectorPicker,
  parameters: { layout: "padded" },
  args: {
    onSelect: () => {},
  },
  decorators: [withFileContext],
} satisfies Meta<typeof FileSelectorPicker>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomPlaceholder: Story = {
  args: {
    placeholder: "Choose a comparison file",
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
