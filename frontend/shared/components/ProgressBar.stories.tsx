import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProgressBar } from "@shared/components/ProgressBar";

const meta: Meta<typeof ProgressBar> = {
  title: "Primitives/ProgressBar",
  component: ProgressBar,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: { value: 0.5, height: 6, thresholded: false },
  argTypes: {
    value: { control: { type: "range", min: 0, max: 1, step: 0.01 } },
    height: { control: { type: "number" } },
    thresholded: { control: "boolean" },
  },
  decorators: [
    (S) => (
      <div style={{ width: "24rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ProgressBar>;

/** Drag the value slider, toggle thresholded, change height in controls. */
export const Playground: Story = {};

export const ThresholdLadder: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {[0, 0.25, 0.5, 0.79, 0.85, 0.95, 0.98, 1].map((v) => (
        <div
          key={v}
          style={{
            display: "grid",
            gridTemplateColumns: "3rem 1fr",
            gap: 12,
            alignItems: "center",
          }}
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
            {Math.round(v * 100)}%
          </span>
          <ProgressBar value={v} thresholded />
        </div>
      ))}
    </div>
  ),
};

export const InContext_UsageMeter: Story = {
  decorators: [
    (S) => (
      <div
        style={{
          width: "16rem",
          padding: 14,
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          background: "var(--color-surface)",
        }}
      >
        <S />
      </div>
    ),
  ],
  render: () => (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          marginBottom: 6,
        }}
      >
        <span style={{ color: "var(--color-text-4)" }}>Docs processed</span>
        <span style={{ color: "var(--color-text-2)", fontWeight: 500 }}>
          412 / 500
        </span>
      </div>
      <ProgressBar value={0.824} thresholded label="Docs processed" />
      <div
        style={{
          marginTop: 8,
          fontSize: 11,
          color: "var(--color-amber-dark)",
        }}
      >
        Approaching the free-plan cap
      </div>
    </div>
  ),
};
