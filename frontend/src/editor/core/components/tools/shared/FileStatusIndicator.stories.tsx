import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";
import FileStatusIndicator from "@editor/components/tools/shared/FileStatusIndicator";
import {
  clearRecentFiles,
  seedRecentFile,
  storyFile,
  storyFileStub,
  withFileSources,
} from "@editor/components/shared/fileSourcesStoryProviders";

/**
 * The body of every tool's Files step. Until the tool has enough files it
 * offers the sources as tiles; after that it is one line naming the files.
 */
const meta = {
  title: "Tools/Shared/FileStatusIndicator",
  component: FileStatusIndicator,
  parameters: { layout: "padded" },
  decorators: [withFileSources],
  beforeEach: clearRecentFiles,
} satisfies Meta<typeof FileStatusIndicator>;
export default meta;

type Story = StoryObj<typeof meta>;

/** A first visit: no recents yet, so only the computer is offered. */
export const NoFiles: Story = {
  args: { selectedFiles: [] },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("button", { name: "Computer" }),
    ).toBeVisible();
  },
};

/** With recents to pick from and the server's mobile upload on. */
export const AllSources: Story = {
  args: { selectedFiles: [] },
  beforeEach: seedRecentFile,
  parameters: { fileSources: { mobileScanner: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const name of ["Computer", "Library", "Phone"]) {
      await expect(await canvas.findByRole("button", { name })).toBeVisible();
    }
  },
};

/** Uploading from a phone makes no sense on a phone, so that source hides. */
export const OnAPhone: Story = {
  args: { selectedFiles: [] },
  parameters: { fileSources: { mobileScanner: true } },
  globals: { viewport: { value: "mobile2", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("button", { name: "Computer" }),
    ).toBeVisible();
    // The phone check is a media query that settles after the first paint.
    await waitFor(() =>
      expect(
        canvas.queryByRole("button", { name: "Phone" }),
      ).not.toBeInTheDocument(),
    );
  },
};

export const OneFile: Story = {
  args: { selectedFiles: [storyFile("quarterly-report.pdf")] },
};

/** The middle gives way so the start and the distinguishing end both show. */
export const LongFileName: Story = {
  args: {
    selectedFiles: [
      storyFile("2026-annual-shareholder-meeting-minutes-final-v3.pdf"),
    ],
  },
};

export const SeveralFiles: Story = {
  args: {
    selectedFiles: [
      storyFile("invoice-001.pdf"),
      storyFile("invoice-002.pdf"),
      storyFile("invoice-003.pdf"),
    ],
  },
};

/** A tool such as Merge that needs two files says so before it has any. */
export const NeedsTwoFiles: Story = {
  args: { selectedFiles: [], minFiles: 2 },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText("Add at least 2 files"),
    ).toBeVisible();
  },
};

/** After the first of two files, the name, the hint and the tiles all show. */
export const NeedsOneMoreFile: Story = {
  args: { selectedFiles: [storyFile("contract.pdf")], minFiles: 2 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("contract.pdf")).toBeVisible();
    await expect(canvas.getByText("Add at least 2 files")).toBeVisible();
    await expect(
      await canvas.findByRole("button", { name: "Computer" }),
    ).toBeVisible();
  },
};

/**
 * A file this tool can't edit, here a signed one, stays listed with the
 * reason behind its warning icon, and the tiles offer something usable.
 */
export const LockedFile: Story = {
  args: { selectedFiles: [], unavailableFiles: [storyFileStub("signed.pdf")] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Why signed.pdf is unavailable" }),
    ).toBeVisible();
    await expect(
      await canvas.findByRole("button", { name: "Computer" }),
    ).toBeVisible();
  },
};
