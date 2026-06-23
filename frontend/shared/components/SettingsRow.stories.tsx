import type { Meta, StoryObj } from "@storybook/react-vite";
import { SettingsRow } from "@shared/components/SettingsRow";
import { ToggleSwitch } from "@shared/components/ToggleSwitch";
import { Select } from "@shared/components/Select";
import { Card } from "@shared/components/Card";

const meta: Meta<typeof SettingsRow> = {
  title: "Primitives/SettingsRow",
  component: SettingsRow,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "24rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SettingsRow>;

export const Toggle: Story = {
  args: {
    label: "Auto-classify",
    control: <ToggleSwitch checked onChange={() => {}} size="sm" />,
  },
};

export const WithDescription: Story = {
  args: {
    label: "Detect PII",
    description: "Scan documents for sensitive fields on save",
    control: <ToggleSwitch checked onChange={() => {}} size="sm" />,
  },
};

/** A settings list inside a padding-none Card. */
export const List: Story = {
  render: () => (
    <Card padding="none">
      {[
        { label: "Auto-classify", on: true },
        { label: "Extract tables", on: true },
        { label: "Strip blank pages", on: false },
      ].map((r, i) => (
        <div
          key={r.label}
          style={{
            padding: "0.7rem 0.875rem",
            borderTop: i > 0 ? "1px solid var(--color-border)" : undefined,
          }}
        >
          <SettingsRow
            label={r.label}
            control={
              <ToggleSwitch checked={r.on} onChange={() => {}} size="sm" />
            }
          />
        </div>
      ))}
    </Card>
  ),
};

export const SelectControl: Story = {
  args: {
    label: "OCR level",
    control: (
      <Select
        inputSize="sm"
        value="high"
        onChange={() => {}}
        options={[
          { value: "standard", label: "Standard" },
          { value: "high", label: "High" },
          { value: "max", label: "Maximum" },
        ]}
      />
    ),
  },
};
