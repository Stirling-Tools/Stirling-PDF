import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@shared/components/Stack";
import { Inline } from "@shared/components/Inline";
import { Card } from "@shared/components/Card";

const meta: Meta<typeof Stack> = {
  title: "Primitives/Layout/Stack",
  component: Stack,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Stack>;

function Box({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 8,
        background: "var(--color-bg-muted)",
        borderRadius: 6,
        fontSize: 12,
      }}
    >
      {children}
    </div>
  );
}

export const Default: Story = {
  render: () => (
    <Stack gap="2" style={{ width: "20rem" }}>
      <Box>One</Box>
      <Box>Two</Box>
      <Box>Three</Box>
    </Stack>
  ),
};

export const GapSizes: Story = {
  render: () => (
    <Inline gap="6" align="start">
      {(["1", "2", "4", "6"] as const).map((gap) => (
        <Stack key={gap} gap={gap}>
          <div style={{ fontSize: 11, color: "var(--color-text-4)" }}>
            gap {gap}
          </div>
          <Box>A</Box>
          <Box>B</Box>
          <Box>C</Box>
        </Stack>
      ))}
    </Inline>
  ),
};

export const InCard: Story = {
  render: () => (
    <Card padding="loose" style={{ width: "20rem" }}>
      <Stack gap="3">
        <div style={{ fontWeight: 600 }}>Card title</div>
        <div style={{ color: "var(--color-text-3)", fontSize: 13 }}>
          Stack is the default vertical container — it's how you compose every
          card body, list, and form section.
        </div>
        <Box>Action row</Box>
      </Stack>
    </Card>
  ),
};
