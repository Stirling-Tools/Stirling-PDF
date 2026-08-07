/**
 * The brand marks and the chrome controls that sit beside them. Grouped in one
 * file because each is a handful of props and they are always seen together in
 * the app's top-left corner.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Dropdown } from "@app/ui";
import { AppSwitchMenuItems } from "@app/components/shared/AppSwitch";
import { LogoIcon } from "@app/components/shared/LogoIcon";
import { SidebarToggleIcon } from "@app/components/shared/SidebarToggleIcon";
import { Wordmark } from "@app/components/shared/Wordmark";

const meta: Meta = {
  title: "Shared/Brand marks",
  parameters: { layout: "padded" },
};
export default meta;

const Row = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: "1.25rem",
      padding: "0.75rem 0",
    }}
  >
    <span
      style={{
        width: 190,
        fontSize: "0.78rem",
        color: "var(--c-text-muted)",
        fontFamily: "var(--font-mono, monospace)",
      }}
    >
      {label}
    </span>
    {children}
  </div>
);

/** The wordmark, at rest and muted. Both swap asset with the theme, so switch
 *  the toolbar theme to check the dark pairing. */
export const WordmarkVariants: StoryObj = {
  render: () => (
    <div>
      <Row label="default">
        <Wordmark alt="Stirling PDF" style={{ height: 28 }} />
      </Row>
      <Row label="muted">
        <Wordmark muted alt="Stirling PDF" style={{ height: 28 }} />
      </Row>
      <Row label="small">
        <Wordmark alt="Stirling PDF" style={{ height: 18 }} />
      </Row>
    </div>
  ),
};

/** The icon-only mark, at the sizes the chrome uses it. */
export const LogoIconSizes: StoryObj = {
  render: () => (
    <div>
      <Row label="16">
        <LogoIcon alt="Stirling" style={{ height: 16 }} />
      </Row>
      <Row label="24">
        <LogoIcon alt="Stirling" style={{ height: 24 }} />
      </Row>
      <Row label="40">
        <LogoIcon alt="Stirling" style={{ height: 40 }} />
      </Row>
    </div>
  ),
};

/** The sidebar toggle. `mirrored` points it at the opposite edge, so the same
 *  glyph serves a left and a right rail. */
export const SidebarToggle: StoryObj = {
  render: () => (
    <div>
      <Row label="default">
        <SidebarToggleIcon />
      </Row>
      <Row label="mirrored">
        <SidebarToggleIcon mirrored />
      </Row>
      <Row label="size 28">
        <SidebarToggleIcon size={28} />
      </Row>
      <Row label="mirrored, size 28">
        <SidebarToggleIcon mirrored size={28} />
      </Row>
    </div>
  ),
};

/** Switching between the editor and the processor. `AppSwitchMenuItems` is a
 *  fragment of dropdown items rather than a standalone menu, so it is shown in
 *  the Dropdown its callers mount it in. The app you are already in shows as
 *  current and is not offered as a destination. */
function AppSwitchDemo({ current }: { current: "editor" | "processor" }) {
  return (
    <Dropdown.Root defaultOpen>
      <Dropdown.Trigger>
        <Button variant="tertiary">Switch app</Button>
      </Dropdown.Trigger>
      <Dropdown.Menu>
        <AppSwitchMenuItems current={current} onSwitch={() => {}} />
      </Dropdown.Menu>
    </Dropdown.Root>
  );
}

export const AppSwitchFromEditor: StoryObj = {
  render: () => <AppSwitchDemo current="editor" />,
};

/** The same menu seen from the processor. */
export const AppSwitchFromProcessor: StoryObj = {
  render: () => <AppSwitchDemo current="processor" />,
};
