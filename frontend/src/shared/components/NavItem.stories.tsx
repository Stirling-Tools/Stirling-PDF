import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { NavItem } from "@shared/components/NavItem";
import { SectionDivider } from "@shared/components/SectionDivider";

function Dot({ color = "var(--color-blue)" }: { color?: string }) {
  return (
    <span
      style={{
        width: 14,
        height: 14,
        borderRadius: 3,
        background: color,
        display: "inline-block",
      }}
    />
  );
}

const meta: Meta<typeof NavItem> = {
  title: "Primitives/NavItem",
  component: NavItem,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: { id: "home", label: "Home", isActive: false },
  argTypes: { isActive: { control: "boolean" } },
  decorators: [
    (S) => (
      <div
        style={{
          width: "15rem",
          background: "var(--color-sidebar-bg)",
          padding: 10,
          border: "1px solid var(--color-sidebar-border)",
          borderRadius: 6,
        }}
      >
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof NavItem>;

/** Flip isActive / label / icon / trailing in controls. */
export const Playground: Story = {
  args: { icon: <Dot /> },
};

export const WithTrailingBadge: Story = {
  args: {
    icon: <Dot />,
    trailing: (
      <span
        style={{
          fontSize: 11,
          color: "var(--color-blue)",
          background: "var(--color-blue-light)",
          padding: "1px 6px",
          borderRadius: 10,
        }}
      >
        3
      </span>
    ),
  },
};

export const InContext_SidebarGroup: Story = {
  render: () => {
    function Bound() {
      const [active, setActive] = useState("pipelines");
      const items = [
        { id: "home", label: "Home" },
        { id: "editor", label: "Editor" },
        { id: "sources", label: "Sources" },
        { id: "pipelines", label: "Pipelines" },
        { id: "documents", label: "Documents" },
      ];
      return (
        <div>
          <NavItem
            id="home"
            label="Home"
            icon={<Dot />}
            isActive={active === "home"}
            onClick={setActive}
          />
          <SectionDivider />
          {items.slice(1).map((item) => (
            <NavItem
              key={item.id}
              id={item.id}
              label={item.label}
              icon={<Dot color="var(--color-purple)" />}
              isActive={active === item.id}
              onClick={setActive}
            />
          ))}
        </div>
      );
    }
    return <Bound />;
  },
};
