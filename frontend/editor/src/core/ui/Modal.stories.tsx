import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@app/ui/Button";
import { Modal } from "@app/ui/Modal";

/**
 * The shared dialog primitive. Focus trapping and restoration are delegated to
 * Mantine's FocusTrap; the body takes a tab stop of its own only while it
 * actually overflows, so a dialog full of controls gains no stray stop.
 */
const meta: Meta<typeof Modal> = {
  title: "Primitives/Modal",
  component: Modal,
  parameters: { layout: "fullscreen" },
  args: { open: true, onClose: () => {} },
};
export default meta;

type Story = StoryObj<typeof Modal>;

const Body = () => (
  <p style={{ margin: 0 }}>
    Removing this file also removes it from the two pipelines that reference it.
    This cannot be undone.
  </p>
);

const Actions = () => (
  <>
    <Button variant="tertiary">Cancel</Button>
    <Button accent="danger">Delete</Button>
  </>
);

/** Title, body and footer actions. */
export const Default: Story = {
  args: { title: "Delete file", footer: <Actions />, children: <Body /> },
};

/** A title that needs qualifying. */
export const WithSubtitle: Story = {
  args: {
    title: "Delete file",
    subtitle: "contract-2026-final.pdf",
    footer: <Actions />,
    children: <Body />,
  },
};

/** No visible title, so `ariaLabel` supplies the dialog's accessible name. */
export const LabelledWithoutTitle: Story = {
  args: { ariaLabel: "Session expired", children: <Body /> },
};

/** The four widths: sm 24rem, md 32rem, lg 48rem, xl 64rem. */
export const WidthSm: Story = {
  args: { title: "Small", width: "sm", children: <Body /> },
};
export const WidthMd: Story = {
  args: { title: "Medium", width: "md", children: <Body /> },
};
export const WidthLg: Story = {
  args: { title: "Large", width: "lg", children: <Body /> },
};
export const WidthXl: Story = {
  args: { title: "Extra large", width: "xl", children: <Body /> },
};

/** Body longer than the viewport scrolls inside the dialog, not the page. It
 *  holds no control of its own, so it becomes focusable and a keyboard user can
 *  scroll it — the case that would otherwise be unreachable. */
export const ScrollingTextOnlyBody: Story = {
  args: {
    title: "Terms of service",
    footer: <Button>Accept</Button>,
    children: (
      <div style={{ display: "grid", gap: "1rem" }}>
        {Array.from({ length: 24 }, (_, i) => (
          <p key={i} style={{ margin: 0 }}>
            {i + 1}. Each party shall retain the records described in this
            section for the period required by the applicable retention policy,
            and shall make them available on reasonable notice.
          </p>
        ))}
      </div>
    ),
  },
};

/** A long body that does contain controls: it scrolls, but the controls are
 *  already reachable, so no extra tab stop is added. */
export const ScrollingBodyWithControls: Story = {
  args: {
    title: "Choose files",
    footer: <Button>Add selected</Button>,
    children: (
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {Array.from({ length: 20 }, (_, i) => (
          <label key={i} style={{ display: "flex", gap: "0.5rem" }}>
            <input type="checkbox" />
            report-{String(i + 1).padStart(2, "0")}.pdf
          </label>
        ))}
      </div>
    ),
  },
};

/** Backdrop and Escape dismissal disabled — the footer is the only way out,
 *  for a step that must not be abandoned half-done. */
export const NotDismissable: Story = {
  args: {
    title: "Finishing upload",
    disableBackdropClose: true,
    disableEscapeClose: true,
    footer: <Button>Done</Button>,
    children: <Body />,
  },
};

/** Closed — nothing is rendered into the portal. */
export const Closed: Story = {
  args: { open: false, title: "Delete file", children: <Body /> },
};
