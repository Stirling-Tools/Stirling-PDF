import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import AddFileCard from "@app/components/fileEditor/AddFileCard";
import { AppProviders } from "@app/components/AppProviders";

const meta = {
  title: "FileEditor/AddFileCard",
  component: AddFileCard,
  // AddFileCard reads openFilesModal from FilesModalContext, which is only
  // available inside the full provider tree — mount that here with the
  // network fetch + blocking gate disabled so the story renders immediately.
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
  args: {
    onFileSelect: fn(),
  },
} satisfies Meta<typeof AddFileCard>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SingleFileOnly: Story = {
  args: {
    multiple: false,
    accept: "application/pdf",
  },
};
