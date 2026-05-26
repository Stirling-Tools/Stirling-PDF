import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "@shared/components/Card";
import { Button } from "@shared/components/Button";
import { MetricCard } from "@shared/components/MetricCard";
import { StatusBadge } from "@shared/components/StatusBadge";

function CardBody({ color }: { color: string }) {
  return (
    <div>
      <h3 style={{ margin: 0, fontSize: 14, color: "var(--color-text-1)" }}>
        {color} card
      </h3>
      <p
        style={{
          margin: "4px 0 0",
          fontSize: 12,
          color: "var(--color-text-3)",
        }}
      >
        Surface treatment with the {color} accent strip.
      </p>
    </div>
  );
}

const meta: Meta<typeof Card> = {
  title: "Primitives/Card",
  component: Card,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    accent: undefined,
    padding: "default",
    interactive: false,
  },
  argTypes: {
    accent: {
      control: "inline-radio",
      options: [undefined, "blue", "purple", "green", "amber", "red"],
    },
    padding: {
      control: "inline-radio",
      options: ["tight", "default", "loose"],
    },
    interactive: { control: "boolean" },
  },
  decorators: [
    (S) => (
      <div style={{ width: "20rem" }}>
        <S />
      </div>
    ),
  ],
  render: (args) => (
    <Card {...args}>
      <CardBody color={args.accent ?? "neutral"} />
    </Card>
  ),
};
export default meta;
type Story = StoryObj<typeof Card>;

/** Flip accent / padding / interactive in controls. */
export const Playground: Story = {};

export const AccentMatrix: Story = {
  decorators: [
    (S) => (
      <div style={{ width: "100%" }}>
        <S />
      </div>
    ),
  ],
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 12,
      }}
    >
      {(["blue", "purple", "green", "amber", "red", undefined] as const).map(
        (accent) => (
          <Card key={accent ?? "none"} accent={accent}>
            <CardBody color={accent ?? "neutral"} />
          </Card>
        ),
      )}
    </div>
  ),
};

export const InContext_ProductGrid: Story = {
  decorators: [
    (S) => (
      <div style={{ width: "100%" }}>
        <S />
      </div>
    ),
  ],
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 14,
      }}
    >
      <Card accent="purple" padding="loose" interactive>
        <h3 style={{ margin: 0, fontSize: 16 }}>Sources</h3>
        <p
          style={{
            margin: "6px 0 14px",
            fontSize: 13,
            color: "var(--color-text-3)",
          }}
        >
          Attach pipelines where PDFs already live.
        </p>
        <Button variant="outline" accent="purple" size="sm">
          Connect a source
        </Button>
      </Card>
      <Card accent="blue" padding="loose" interactive>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 6,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16 }}>Pipelines</h3>
          <StatusBadge tone="info" size="sm">
            Hero
          </StatusBadge>
        </div>
        <p
          style={{
            margin: "0 0 14px",
            fontSize: 13,
            color: "var(--color-text-3)",
          }}
        >
          Compose document workflows from typed operations.
        </p>
        <Button variant="outline" accent="blue" size="sm">
          Build a pipeline
        </Button>
      </Card>
      <Card accent="purple" padding="loose" interactive>
        <h3 style={{ margin: 0, fontSize: 16 }}>Agents</h3>
        <p
          style={{
            margin: "6px 0 14px",
            fontSize: 13,
            color: "var(--color-text-3)",
          }}
        >
          Wire your agent via MCP, REST, or tool definitions.
        </p>
        <Button variant="outline" accent="purple" size="sm">
          Connect an agent
        </Button>
      </Card>
    </div>
  ),
};

export const InContext_MetricsInsideCard: Story = {
  args: { padding: "loose" },
  render: (args) => (
    <Card {...args}>
      <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>Last 24 hours</h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
        }}
      >
        <MetricCard label="Docs" value={"1,287"} />
        <MetricCard label="Errors" value={"0.4%"} />
        <MetricCard label="P95" value="412ms" />
        <MetricCard label="Uptime" value="99.99%" />
      </div>
    </Card>
  ),
};
