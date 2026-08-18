import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppBanner } from "@app/components/shared/AppBanner";

const meta = {
  title: "Shared/AppBanner",
  component: AppBanner,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AppBanner>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {
  args: {
    icon: "info-rounded",
    title: "Heads up",
    message: "This document contains form fields that will be flattened.",
  },
};

export const Promo: Story = {
  args: {
    tone: "promo",
    icon: "stars-rounded",
    title: "Upgrade to Server Plan",
    message:
      "Get the most out of Stirling PDF with unlimited users and advanced features.",
    buttonText: "Upgrade Now",
    buttonIcon: "upgrade-rounded",
    onButtonClick: () => {},
    compact: true,
  },
};

export const Warning: Story = {
  args: {
    tone: "warning",
    icon: "warning-rounded",
    title: "Action required",
    message: "Some pages could not be processed and were skipped.",
    buttonText: "Review",
    onButtonClick: () => {},
  },
};

export const Danger: Story = {
  args: {
    tone: "danger",
    icon: "warning-rounded",
    title: "This server needs admin attention",
    message: "Review the license requirements to keep this server compliant.",
    buttonText: "See info",
    buttonIcon: "info-rounded",
    onButtonClick: () => {},
    dismissible: false,
  },
};

export const Compact: Story = {
  args: {
    compact: true,
    icon: "info-rounded",
    message: "Autosave is enabled for this file.",
    dismissible: false,
  },
};

/** Message-only, no title: the message takes the title's weight so the bar still reads. */
export const MessageOnly: Story = {
  args: {
    icon: "picture-as-pdf-rounded",
    message:
      "Make Stirling PDF your default application for opening PDF files.",
    buttonText: "Set Default",
    onButtonClick: () => {},
    secondaryButtonText: "Don't remind me again",
    onSecondaryButtonClick: () => {},
  },
};

function Row({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <section
      style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}
    >
      <span
        style={{
          fontSize: "0.6875rem",
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--c-text-subtle)",
          padding: "0 1rem",
        }}
      >
        {caption}
      </span>
      {children}
    </section>
  );
}

/**
 * Every top bar the app can show, in one place: each entry mirrors a real caller,
 * so a change to the component is visible against the whole set at once. Renders a
 * composition rather than the component, so it takes no args of its own.
 */
export const AllTopBars: StoryObj = {
  render: () => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
        padding: "1.5rem 0",
        background: "var(--c-bg)",
      }}
    >
      <Row caption="Upgrade prompt · UpgradeBanner (friendly)">
        <AppBanner
          tone="promo"
          compact
          icon="stars-rounded"
          title="Upgrade to Server Plan"
          message="Get the most out of Stirling PDF with unlimited users and advanced features."
          buttonText="Upgrade Now"
          buttonIcon="upgrade-rounded"
          onButtonClick={() => {}}
        />
      </Row>

      <Row caption="Server needs attention · UpgradeBanner (urgent)">
        <AppBanner
          tone="warning"
          icon="warning-rounded"
          title="This server needs admin attention"
          message="Review the license requirements to keep this server compliant."
          buttonText="See info"
          buttonIcon="info-rounded"
          onButtonClick={() => {}}
          dismissible={false}
        />
      </Row>

      <Row caption="Free tier limit reached · AdminPlanSection">
        <AppBanner
          tone="warning"
          icon="warning-rounded"
          title="Free self-hosted limit reached"
          message="You have 12 users on a plan that covers 10."
          buttonText="See plans"
          buttonIcon="upgrade-rounded"
          onButtonClick={() => {}}
          dismissible={false}
        />
      </Row>

      <Row caption="Team invitation · TeamInvitationBanner">
        <AppBanner
          icon="mail"
          message="You have been invited to join the Acme Legal team."
          buttonText="Accept"
          onButtonClick={() => {}}
          secondaryButtonText="Decline"
          onSecondaryButtonClick={() => {}}
          dismissible={false}
        />
      </Row>

      <Row caption="Set as default app · DefaultAppBanner (desktop)">
        <AppBanner
          icon="picture-as-pdf-rounded"
          message="Make Stirling PDF your default application for opening PDF files."
          buttonText="Set Default"
          onButtonClick={() => {}}
          secondaryButtonText="Don't remind me again"
          onSecondaryButtonClick={() => {}}
        />
      </Row>

      <Row caption="Danger tone (available, no caller yet)">
        <AppBanner
          tone="danger"
          icon="warning-rounded"
          title="Storage is full"
          message="New uploads will fail until space is freed."
          buttonText="Manage storage"
          onButtonClick={() => {}}
          dismissible={false}
        />
      </Row>
    </div>
  ),
};
