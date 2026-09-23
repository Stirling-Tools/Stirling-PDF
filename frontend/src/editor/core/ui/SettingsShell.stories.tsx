import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SettingsShell, type SettingsNavSection } from "@app/ui/SettingsShell";
import { Button } from "@app/ui/Button";

const SECTIONS: SettingsNavSection[] = [
  {
    title: "Account",
    items: [
      { key: "profile", label: "Profile" },
      { key: "appearance", label: "Appearance" },
      { key: "notifications", label: "Notifications" },
    ],
  },
  {
    title: "Workspace",
    items: [{ key: "general", label: "General" }],
  },
  {
    title: "Admin",
    items: [
      { key: "auth", label: "Authentication" },
      { key: "sessions", label: "Active sessions" },
      { key: "beta", label: "Early access", badge: "New" },
    ],
  },
];

const LABELS: Record<string, string> = {
  profile: "Profile",
  appearance: "Appearance",
  notifications: "Notifications",
  general: "General",
  auth: "Authentication",
  sessions: "Active sessions",
  beta: "Early access",
};

const meta: Meta<typeof SettingsShell> = {
  title: "Shared/SettingsShell",
  component: SettingsShell,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof SettingsShell>;

export const Default: Story = {
  render: () => {
    const [active, setActive] = useState("profile");
    return (
      <div style={{ height: "36rem", border: "1px solid var(--c-border)" }}>
        <SettingsShell
          sections={SECTIONS}
          activeKey={active}
          onSelect={setActive}
          title={LABELS[active]}
          onClose={() => {}}
          footer={
            <>
              <Button variant="tertiary">Cancel</Button>
              <Button>Save changes</Button>
            </>
          }
        >
          <p style={{ color: "var(--c-text-subtle)" }}>
            Content for the “{LABELS[active]}” section renders here.
          </p>
        </SettingsShell>
      </div>
    );
  },
};
