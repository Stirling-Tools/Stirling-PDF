import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tabs, type TabItem } from "@shared/components/Tabs";

const baseItems: TabItem[] = [
  { key: "deployed", label: "Deployed", count: 6 },
  { key: "templates", label: "Templates", count: 4 },
  { key: "archive", label: "Archive", count: 0 },
];

function Bound({
  items = baseItems,
  variant = "pill" as const,
}: {
  items?: TabItem[];
  variant?: "pill" | "underline";
}) {
  const [active, setActive] = useState(items[0].key);
  return (
    <Tabs
      items={items}
      activeKey={active}
      onChange={setActive}
      variant={variant}
    />
  );
}

const meta: Meta<typeof Tabs> = {
  title: "Primitives/Tabs",
  component: Tabs,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: { variant: "pill" },
  argTypes: {
    variant: { control: "inline-radio", options: ["pill", "underline"] },
  },
  render: (args) => <Bound items={baseItems} variant={args.variant} />,
};
export default meta;
type Story = StoryObj<typeof Tabs>;

/** Flip variant in controls. */
export const Playground: Story = {};

export const WithDisabledTab: Story = {
  render: () => (
    <Bound
      items={[
        { key: "a", label: "Available" },
        { key: "b", label: "Coming soon", disabled: true },
      ]}
    />
  ),
};

export const InContext_DocumentVerticals: Story = {
  render: () => (
    <Bound
      items={[
        { key: "all", label: "All" },
        {
          key: "insurance",
          label: "Insurance",
          count: 7,
          accentColor: "#0ea5e9",
          dotColor: "#0ea5e9",
        },
        {
          key: "finance",
          label: "Finance",
          count: 7,
          accentColor: "#10b981",
          dotColor: "#10b981",
        },
        {
          key: "legal",
          label: "Legal",
          count: 6,
          accentColor: "#3B82F6",
          dotColor: "#3B82F6",
        },
        {
          key: "healthcare",
          label: "Healthcare",
          count: 6,
          accentColor: "#8B5CF6",
          dotColor: "#8B5CF6",
        },
      ]}
    />
  ),
};
