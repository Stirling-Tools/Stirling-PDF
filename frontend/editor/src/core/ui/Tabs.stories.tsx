import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tabs, type TabItem } from "@app/ui/Tabs";

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
          accentColor: "var(--color-cat-insurance)",
          dotColor: "var(--color-cat-insurance)",
        },
        {
          key: "finance",
          label: "Finance",
          count: 7,
          accentColor: "var(--color-cat-finance)",
          dotColor: "var(--color-cat-finance)",
        },
        {
          key: "legal",
          label: "Legal",
          count: 6,
          accentColor: "var(--color-cat-legal)",
          dotColor: "var(--color-cat-legal)",
        },
        {
          key: "healthcare",
          label: "Healthcare",
          count: 6,
          accentColor: "var(--color-cat-healthcare)",
          dotColor: "var(--color-cat-healthcare)",
        },
      ]}
    />
  ),
};
