import type { Meta, StoryObj } from "@storybook/react-vite";
import { Chip } from "@shared/components/Chip";

const ACCENTS = [
  "default",
  "neutral",
  "brand",
  "ai",
  "premium",
  "danger",
  "success",
  "warning",
] as const;

const meta: Meta<typeof Chip> = {
  title: "Primitives/Chip",
  component: Chip,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: {
    children: "us-east-1",
    accent: "default",
    variant: "secondary",
    size: "md",
    showDot: false,
  },
  argTypes: {
    accent: { control: "inline-radio", options: ACCENTS },
    variant: { control: "inline-radio", options: ["primary", "secondary"] },
    size: { control: "inline-radio", options: ["xs", "sm", "md", "lg"] },
    showDot: { control: "boolean" },
    onClick: { action: "clicked" },
    onRemove: { action: "removed" },
  },
};
export default meta;
type Story = StoryObj<typeof Chip>;

/** Flip accent / variant / size / dot / interactive / removable in controls. */
export const Playground: Story = {};

export const Accents: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {(["secondary", "primary"] as const).map((variant) => (
        <div key={variant} style={{ display: "flex", gap: 8 }}>
          {ACCENTS.map((a) => (
            <Chip key={a} accent={a} variant={variant}>
              {a}
            </Chip>
          ))}
        </div>
      ))}
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
      <Chip accent="success" showDot>
        ocr
      </Chip>
      <Chip accent="success" showDot>
        classify
      </Chip>
      <Chip accent="success" showDot>
        extract
      </Chip>
      <Chip accent="default" showDot>
        validate
      </Chip>
      <Chip accent="danger" showDot>
        redact
      </Chip>
      <Chip accent="danger" showDot>
        encrypt-rest
      </Chip>
      <Chip accent="premium" showDot>
        store-primary
      </Chip>
    </div>
  ),
};
