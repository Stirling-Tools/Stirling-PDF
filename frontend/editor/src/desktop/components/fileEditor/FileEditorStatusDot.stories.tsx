/**
 * The save-state dot on a desktop file thumbnail. Three states, decided from
 * the file stub rather than a prop: never written to disk, written but with
 * unsaved edits, and clean.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileEditorStatusDot } from "@app/components/fileEditor/FileEditorStatusDot";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

function stub(overrides: Partial<StirlingFileStub>): StirlingFileStub {
  return {
    id: "story-file" as FileId,
    name: "report.pdf",
    type: "application/pdf",
    size: 120_000,
    lastModified: Date.parse("2026-03-14T09:30:00Z"),
    isLeaf: true,
    originalFileId: "story-file",
    versionNumber: 1,
    ...overrides,
  } as StirlingFileStub;
}

const meta: Meta<typeof FileEditorStatusDot> = {
  title: "Desktop/FileEditorStatusDot",
  component: FileEditorStatusDot,
  parameters: { layout: "centered" },
};
export default meta;

type Story = StoryObj<typeof FileEditorStatusDot>;

/** Held in memory only — nothing has been written to disk yet. */
export const NotSaved: Story = {
  args: { file: stub({ localFilePath: undefined }) },
};

/** On disk, but edited since. */
export const UnsavedChanges: Story = {
  args: { file: stub({ localFilePath: "/tmp/report.pdf", isDirty: true }) },
};

export const Saved: Story = {
  args: { file: stub({ localFilePath: "/tmp/report.pdf", isDirty: false }) },
};
