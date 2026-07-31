import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { NavItem } from "@app/ui/NavItem";
import { SectionDivider } from "@app/ui/SectionDivider";
import { GoogleDriveIcon } from "@app/components/shared/CloudStorageIcons";

function Dot({ color = "var(--c-primary)" }: { color?: string }) {
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
          background: "var(--c-bg-raised)",
          padding: 10,
          border: "1px solid var(--c-border)",
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
          color: "var(--c-primary)",
          background: "var(--c-primary-tint)",
          padding: "1px 6px",
          borderRadius: 10,
        }}
      >
        3
      </span>
    ),
  },
};

/** Every state side by side; hover a row to see the hover treatment. */
export const States: Story = {
  render: () => (
    <div>
      <NavItem id="rest" label="Rest" icon={<Dot />} />
      <NavItem id="active" label="Active" icon={<Dot />} isActive />
      <NavItem id="disabled" label="Disabled" icon={<Dot />} disabled />
      <NavItem
        id="accent"
        label="Accent (status edge)"
        icon={<Dot color="var(--color-green)" />}
        accent="green"
      />
    </div>
  ),
};

/** Collapsed rail: `iconOnly` centres the icon and drops the label. */
export const IconOnlyRail: Story = {
  decorators: [
    (S) => (
      <div
        style={{
          width: "3rem",
          background: "var(--c-bg-raised)",
          padding: "6px 0",
          border: "1px solid var(--c-border)",
          borderRadius: 6,
        }}
      >
        <S />
      </div>
    ),
  ],
  render: () => (
    <div>
      <NavItem id="search" label="Search" icon={<Dot />} iconOnly />
      <NavItem
        id="files"
        label="My Files"
        icon={<Dot color="var(--color-purple)" />}
        iconOnly
      />
      <NavItem id="home" label="Home" icon={<Dot />} iconOnly isActive />
    </div>
  ),
};

/** `hoverIcon` cross-fades in on hover, e.g. a vendor mark gaining colour. */
export const HoverIconSwap: Story = {
  render: () => (
    <div>
      <NavItem
        id="drive"
        label="Google Drive"
        icon={<GoogleDriveIcon />}
        hoverIcon={<GoogleDriveIcon colored />}
      />
      <NavItem
        id="drive-off"
        label="Google Drive (not configured)"
        icon={<GoogleDriveIcon />}
        disabled
      />
    </div>
  ),
};

/** The field variant: a row hosting an inline control, so not a `<button>`. */
export const FieldRow: Story = {
  render: () => (
    <div>
      <div className="sui-navitem sui-navitem--field">
        <span className="sui-navitem__icon">
          <Dot />
        </span>
        <input
          placeholder="Search files..."
          style={{
            flex: 1,
            minWidth: 0,
            background: "transparent",
            border: "none",
            outline: "none",
            font: "inherit",
            color: "var(--c-text)",
          }}
        />
      </div>
      <NavItem id="search" label="Search" icon={<Dot />} />
    </div>
  ),
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
