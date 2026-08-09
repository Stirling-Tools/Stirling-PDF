import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChatQuickActions } from "@app/components/chat/ChatQuickActions";
import { FileContextProvider } from "@app/contexts/FileContext";
import {
  FilesModalContext,
  type FilesModalContextType,
} from "@app/contexts/FilesModalContext";
import "@app/components/chat/ChatPanel.css";

/**
 * The suggestion block the assistant shows above its composer. It reads the
 * workbench rather than taking a list of actions: an empty workbench offers a
 * way to open files, one PDF offers split (only when it has more than one page)
 * and compress, several files offer merge and compress, and anything that isn't
 * a PDF adds a convert-to-PDF suggestion. With files present it also renders a
 * pill per file — three, then a "+n more" that opens the files modal.
 *
 * Only the empty-workbench state is reachable in isolation: the populated ones
 * need files loaded into FileContext, which has no seeding entry point, so they
 * belong to a story of the chat panel running against a real workbench.
 */
const meta: Meta<typeof ChatQuickActions> = {
  title: "Editor/Chat/ChatQuickActions",
  component: ChatQuickActions,
  parameters: { layout: "padded" },
  args: {
    heading: "What would you like to do?",
    onAction: () => {},
  },
  decorators: [
    (S) => (
      <FileContextProvider>
        {/* Only openFilesModal is read here — the real provider reaches back
            into FileContext and NavigationContext, so a slice is supplied. */}
        <FilesModalContext.Provider
          value={
            { openFilesModal: () => {} } as unknown as FilesModalContextType
          }
        >
          <div style={{ maxWidth: "24rem" }}>
            <S />
          </div>
        </FilesModalContext.Provider>
      </FileContextProvider>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ChatQuickActions>;

/** Nothing in the workbench: no file pills, and a single "open files" action. */
export const EmptyWorkbench: Story = {};
