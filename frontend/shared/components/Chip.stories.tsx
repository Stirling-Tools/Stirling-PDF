import type { Meta, StoryObj } from "@storybook/react-vite";
import { Chip } from "@shared/components/Chip";

const meta: Meta<typeof Chip> = {
  title: "Primitives/Chip",
  component: Chip,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: {
    children: "us-east-1",
    accent: "neutral",
    size: "md",
    showDot: false,
  },
  argTypes: {
    accent: {
      control: "inline-radio",
      options: ["neutral", "blue", "purple", "green", "amber", "red"],
    },
    size: { control: "inline-radio", options: ["sm", "md"] },
    showDot: { control: "boolean" },
    onClick: { action: "clicked" },
    onRemove: { action: "removed" },
  },
};
export default meta;
type Story = StoryObj<typeof Chip>;

/** Flip tone / size / dot / interactive / removable in controls. */
export const Playground: Story = {};

export const ToneRow: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8 }}>
      {(["neutral", "blue", "purple", "green", "amber", "red"] as const).map(
        (t) => (
          <Chip key={t} accent={t}>
            {t}
          </Chip>
        ),
      )}
    </div>
  ),
};

export const InContext_OpChain: Story = {
  render: () => (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        maxWidth: "32rem",
      }}
    >
      <Chip accent="green" showDot>
        ocr
      </Chip>
      <Chip accent="green" showDot>
        classify
      </Chip>
      <Chip accent="green" showDot>
        extract
      </Chip>
      <Chip accent="blue" showDot>
        validate
      </Chip>
      <Chip accent="red" showDot>
        redact
      </Chip>
      <Chip accent="red" showDot>
        encrypt-rest
      </Chip>
      <Chip accent="purple" showDot>
        store-primary
      </Chip>
    </div>
  ),
};
