import type { Meta, StoryObj } from "@storybook/react-vite";
import { documentsFor } from "@portal/mocks/documents";
import { DocumentDrawer } from "@portal/components/documents/DocumentDrawer";
import "@portal/views/Documents.css";

const ALL = documentsFor("enterprise");
const NON_SENSITIVE = ALL.find((d) => !d.sensitive)!;
const SENSITIVE = ALL.find((d) => d.sensitive)!;

const meta: Meta<typeof DocumentDrawer> = {
  title: "Portal/Documents/DocumentDrawer",
  component: DocumentDrawer,
  parameters: { layout: "fullscreen" },
  args: { onClose: () => {} },
};
export default meta;
type Story = StoryObj<typeof DocumentDrawer>;

/** Standard document — all sub-tabs visible, content shown. */
export const Default: Story = {
  args: { doc: NON_SENSITIVE },
};

/**
 * Sensitive document — opens with the zero-standing-access banner; the
 * Extractions tab stays masked until access is requested. On the enterprise
 * tier the banner carries the four-eyes note.
 */
export const Sensitive: Story = {
  args: { doc: SENSITIVE },
};
