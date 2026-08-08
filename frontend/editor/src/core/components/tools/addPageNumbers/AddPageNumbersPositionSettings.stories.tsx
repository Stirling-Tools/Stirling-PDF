/**
 * Where the page number lands, and what it says. The position is a 1–9 grid
 * read like a numeric keypad — 1 is bottom-left, 9 is top-right — so the
 * stories walk the corners rather than exposing position as a control.
 *
 * With no file the preview falls back to a blank page outline; passing a real
 * document is what makes it render a thumbnail, which stories cannot do.
 *
 * The preview reads only the position and the page range, so the appearance
 * parameters (font, margin, custom text, zero padding) are deliberately not
 * varied here — this panel does not render them, and a story that set them
 * would be indistinguishable from the default.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import AddPageNumbersPositionSettings from "@app/components/tools/addPageNumbers/AddPageNumbersPositionSettings";
import {
  defaultParameters,
  type AddPageNumbersParameters,
} from "@app/components/tools/addPageNumbers/useAddPageNumbersParameters";

function Demo({
  overrides,
  disabled,
  showQuickGrid,
}: {
  overrides?: Partial<AddPageNumbersParameters>;
  disabled?: boolean;
  showQuickGrid?: boolean;
}) {
  const [parameters, setParameters] = useState<AddPageNumbersParameters>({
    ...defaultParameters,
    ...overrides,
  });
  return (
    <AddPageNumbersPositionSettings
      parameters={parameters}
      onParameterChange={(key, value) =>
        setParameters((prev) => ({ ...prev, [key]: value }))
      }
      disabled={disabled}
      showQuickGrid={showQuickGrid}
    />
  );
}

const meta: Meta<typeof AddPageNumbersPositionSettings> = {
  title: "Tools/AddPageNumbers/PositionSettings",
  component: AddPageNumbersPositionSettings,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof AddPageNumbersPositionSettings>;

/** Bottom centre — where numbering conventionally sits, and the default. */
export const Default: Story = { render: () => <Demo /> };

export const TopLeft: Story = {
  render: () => <Demo overrides={{ position: 7 }} />,
};

export const TopRight: Story = {
  render: () => <Demo overrides={{ position: 9 }} />,
};

export const BottomLeft: Story = {
  render: () => <Demo overrides={{ position: 1 }} />,
};

/** Numbering that starts partway through, for a document split across files. */
export const StartingNumber: Story = {
  render: () => <Demo overrides={{ startingNumber: 42 }} />,
};

/** A range rather than the whole document. */
export const PageRange: Story = {
  render: () => <Demo overrides={{ pagesToNumber: "2-8,10" }} />,
};

/** Without the quick grid the position is set from the preview alone. */
export const NoQuickGrid: Story = {
  render: () => <Demo showQuickGrid={false} />,
};

/** Disabled while the tool is running. */
export const Disabled: Story = { render: () => <Demo disabled /> };
