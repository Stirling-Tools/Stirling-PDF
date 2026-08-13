/**
 * Mounts the editor's settings modal inside the portal, supplying the contexts
 * the settings tree needs because the portal lives outside the editor's own
 * provider stack.
 *
 * It takes no props: the portal's UI state decides everything. Until settings
 * have been opened once it renders nothing — providers included — so that case
 * is not a story; each story below opens it on mount instead. The section it
 * lands on is the only thing that varies, and the host appends one of its own:
 * the admin "Account link" section, which the editor's registry does not carry.
 */
import { useEffect, useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PortalSettingsHost } from "@portal/components/PortalSettingsHost";
import { useUI } from "@portal/contexts/UIContext";

/**
 * Opens settings once on mount. The portal has no other way in from a story —
 * the host reads the open state off the real UI context rather than a prop.
 */
function OpenOnMount({ section }: { section?: string }) {
  const { openSettings } = useUI();
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    openSettings(section);
  }, [openSettings, section]);
  return null;
}

const meta: Meta<typeof PortalSettingsHost> = {
  title: "Portal/PortalSettingsHost",
  component: PortalSettingsHost,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof PortalSettingsHost>;

/** Opened with no section asked for, so the modal picks its own default. */
export const Opened: Story = {
  render: () => (
    <>
      <OpenOnMount />
      <PortalSettingsHost />
    </>
  ),
};

/** Opened straight onto the portal's own section, under an Admin group. */
export const AtAccountLink: Story = {
  render: () => (
    <>
      <OpenOnMount section="account-link" />
      <PortalSettingsHost />
    </>
  ),
};
