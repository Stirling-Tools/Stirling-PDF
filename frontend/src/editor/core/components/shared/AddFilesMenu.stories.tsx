import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { AddFilesMenu } from "@editor/components/shared/AddFilesMenu";
import {
  clearRecentFiles,
  seedRecentFile,
  withFileSources,
} from "@editor/components/shared/fileSourcesStoryProviders";

/**
 * The "+" in a tool's Files step header once the tool has its files, for
 * adding more from the same sources the empty step shows as tiles.
 */
const meta = {
  title: "Shared/AddFilesMenu",
  component: AddFilesMenu,
  parameters: { layout: "padded", fileSources: { width: "auto" } },
  decorators: [withFileSources],
  beforeEach: clearRecentFiles,
} satisfies Meta<typeof AddFilesMenu>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

/** Every source offered: computer, library and phone. */
export const Open: Story = {
  beforeEach: seedRecentFile,
  parameters: {
    fileSources: { mobileScanner: true, width: "auto" },
    // Mantine puts a focus placeholder div inside every open menu.
    a11y: {
      config: { rules: [{ id: "aria-required-children", enabled: false }] },
    },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Add files" }),
    );
    // The menu is portalled, so its items are on the document, not the canvas.
    const page = within(canvasElement.ownerDocument.body);
    // Waits for the open transition and for the recents read that adds the
    // library item.
    await waitFor(async () => {
      for (const name of ["From computer", "From library", "From phone"]) {
        await expect(page.getByRole("menuitem", { name })).toBeVisible();
      }
    });
  },
};
