/**
 * The attachment picker shared by the Add Attachments tool panel and its
 * automation step: a file chooser, the list of files queued for embedding, and
 * the PDF/A-3b conversion option.
 *
 * Everything on show comes from the `parameters` prop. An empty attachment list
 * hides the list section and leaves the chooser reading "Choose files…"; once
 * files are queued the chooser invites more and each file gets a row with its
 * size and a remove button. `disabled` greys the whole control set, which is
 * how the panel looks while an operation is running.
 */
import type { ReactElement } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import AddAttachmentsSettings from "@app/components/tools/addAttachments/AddAttachmentsSettings";

/** Byte-exact so the reported size is the same on every render. */
function attachment(name: string, kilobytes: number): File {
  return new File([new Uint8Array(kilobytes * 1024)], name, {
    type: "application/octet-stream",
  });
}

const FILES = [
  attachment("invoice-2026-Q1.csv", 18),
  attachment("terms-and-conditions.docx", 246),
];

/** The tool panel is a narrow column; the filename clamp depends on it. */
const inPanel = (Story: () => ReactElement) => (
  <div style={{ maxWidth: 340 }}>
    <Story />
  </div>
);

const meta = {
  title: "Tools/AddAttachments/AddAttachmentsSettings",
  component: AddAttachmentsSettings,
  decorators: [inPanel],
  args: {
    parameters: { attachments: [], convertToPdfA3b: false },
    onParameterChange: () => {},
  },
} satisfies Meta<typeof AddAttachmentsSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Nothing chosen yet: just the chooser and the conversion option. */
export const Default: Story = {};

/** Two files queued, each with its size and a remove button. */
export const WithAttachments: Story = {
  args: { parameters: { attachments: FILES, convertToPdfA3b: false } },
};

/** Archival output requested, which routes the job through Ghostscript. */
export const ConvertToPdfA3b: Story = {
  args: { parameters: { attachments: FILES, convertToPdfA3b: true } },
};

/** A name too long for one line wraps to two and then clips. */
export const LongFileName: Story = {
  args: {
    parameters: {
      attachments: [
        attachment(
          "2026-quarterly-financial-statement-consolidated-final-approved.xlsx",
          512,
        ),
      ],
      convertToPdfA3b: false,
    },
  },
};

/** Locked while the operation runs: nothing can be added or removed. */
export const Disabled: Story = {
  args: {
    parameters: { attachments: FILES, convertToPdfA3b: false },
    disabled: true,
  },
};
