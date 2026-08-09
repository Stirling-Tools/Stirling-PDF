/**
 * The trailing card in the file editor's grid that invites the user to add more
 * files. Clicking the card (or its "Add Files" button) opens the files modal;
 * the smaller button beside it goes straight to the native file picker.
 *
 * The two buttons share one slot: hovering the upload button expands it to fill
 * the row and hides "Add Files". That is internal state, so it is not a story.
 * `accept` and `multiple` only reach the hidden input and change nothing on
 * screen, which leaves a single rendered state.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import AddFileCard from "@app/components/fileEditor/AddFileCard";
import {
  FilesModalContext,
  type FilesModalContextType,
} from "@app/contexts/FilesModalContext";

const meta = {
  title: "FileEditor/AddFileCard",
  component: AddFileCard,
  parameters: { layout: "centered" },
  args: { onFileSelect: () => {} },
  decorators: [
    (Story) => (
      // Only openFilesModal is read. The real provider reaches FileContext and
      // NavigationContext, so a slice is supplied instead.
      <FilesModalContext.Provider
        value={{ openFilesModal: () => {} } as unknown as FilesModalContextType}
      >
        {/* The card fills the cell the file editor's grid gives it. */}
        <div style={{ width: "16rem", height: "20rem" }}>
          <Story />
        </div>
      </FilesModalContext.Provider>
    ),
  ],
} satisfies Meta<typeof AddFileCard>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
