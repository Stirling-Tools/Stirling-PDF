import type { Meta, StoryObj } from "@storybook/react-vite";
import LinkIcon from "@mui/icons-material/Link";
import { NavItem } from "@app/ui/NavItem";
import { NavFooter } from "@app/components/shared/navFooter/NavFooter";

const meta: Meta<typeof NavFooter> = {
  title: "Shared/NavFooter",
  component: NavFooter,
  parameters: { layout: "padded" },
  args: {
    displayName: "admin",
    onOpenSettings: () => {},
    credits: { remaining: 247, total: 500 },
    otherApp: { app: "processor", onOpen: () => {} },
  },
  decorators: [
    (S) => (
      <div
        style={{
          width: "16.25rem",
          background: "var(--c-bg)",
          padding: "0.5rem",
        }}
      >
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof NavFooter>;

/** The editor's footer: credits, "Open PDF Processor", the account row. */
export const InEditor: Story = {};

/** The processor's footer. Same three boxes, opposite switch target. */
export const InProcessor: Story = {
  args: { otherApp: { app: "editor", onOpen: () => {} } },
};

/** Self-hosted processor: no wallet, so no meter, and the link-account CTA
 *  rides along in the account box. */
export const WithLinkAccountCta: Story = {
  args: {
    credits: null,
    otherApp: { app: "editor", onOpen: () => {} },
    accountExtras: (
      <NavItem
        id="account-link"
        label="Link Stirling account"
        icon={<LinkIcon sx={{ fontSize: "1.1rem" }} />}
      />
    ),
  },
};

/** A real profile picture replaces the initials disc. */
export const WithProfilePicture: Story = {
  args: {
    displayName: "Ada Lovelace",
    profilePictureUrl:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="black"/><circle cx="32" cy="24" r="12" fill="white"/><ellipse cx="32" cy="56" rx="20" ry="16" fill="white"/></svg>',
      ),
  },
};

/** Credits running low — the dot and bar shift to the warning tone at 20% left. */
export const CreditsLow: Story = {
  args: { credits: { remaining: 42, total: 500 } },
};

/** Allowance exhausted. */
export const CreditsExhausted: Story = {
  args: { credits: { remaining: 0, total: 500 } },
};

/** Core OSS: no wallet, no second app, settings only. */
export const MinimalBuild: Story = {
  args: { credits: null, otherApp: null },
};

/** No settings handler — the account row is inert identity, not a button. */
export const NoSettings: Story = {
  args: { onOpenSettings: undefined },
};

/** Collapsed icon rail: labels become tooltips. */
export const Collapsed: Story = {
  args: { collapsed: true },
  decorators: [
    (S) => (
      <div
        style={{
          width: "3.5rem",
          background: "var(--c-bg)",
          padding: "0.5rem",
        }}
      >
        <S />
      </div>
    ),
  ],
};
