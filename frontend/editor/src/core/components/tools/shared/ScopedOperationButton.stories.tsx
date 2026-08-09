/**
 * The run button on a tool panel, with wording that follows what it will act
 * on. In the viewer it says "this file"; elsewhere it counts the selection.
 *
 * The viewer's "this file" hint needs more than one document actually loaded
 * into FileContext, which these stories do not seed — so the variants below
 * cover the selection-count path and the ways the hint is suppressed.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScopedOperationButton } from "@app/components/tools/shared/ScopedOperationButton";
import { withToolContexts } from "@app/components/tools/storyFixtures";
import type { StirlingFile } from "@app/types/fileContext";

const file = (name: string) => ({ name }) as unknown as StirlingFile;

const THREE = [
  file("report.pdf"),
  file("appendix.pdf"),
  file("cover-letter.pdf"),
];

const meta: Meta<typeof ScopedOperationButton> = {
  title: "Tools/Shared/ScopedOperationButton",
  component: ScopedOperationButton,
  parameters: { layout: "padded" },
  args: { selectedFiles: [file("report.pdf")], submitText: "Compress" },
  decorators: [withToolContexts({ workbench: "viewer" })],
};
export default meta;

type Story = StoryObj<typeof ScopedOperationButton>;

/** One file selected: no scope suffix to add. */
export const Default: Story = {};

/** Outside the viewer, a multi-file selection is counted in the label. */
export const CountsSelection: Story = {
  args: { selectedFiles: THREE },
  decorators: [withToolContexts({ workbench: "fileEditor" })],
};

/** Hints off: the label stays bare however many files are selected. */
export const ScopeHintsDisabled: Story = {
  args: { selectedFiles: THREE, disableScopeHints: true },
  decorators: [withToolContexts({ workbench: "fileEditor" })],
};

export const Loading: Story = {
  args: { isLoading: true, loadingText: "Compressing…" },
};

export const Disabled: Story = { args: { disabled: true } };

/** The viewer-only lockout, which also suppresses the scope wording. */
export const ViewerModeBlocked: Story = {
  args: { selectedFiles: THREE, disabledReason: "viewerMode", disabled: true },
  decorators: [withToolContexts({ workbench: "fileEditor" })],
};

/** An outline button, which some panels use for secondary operations. */
export const OutlineVariant: Story = { args: { variant: "outline" } };
