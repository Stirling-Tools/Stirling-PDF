import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { InfoBanner } from "@app/components/shared/InfoBanner";

/**
 * Every top bar the app can show, in one place. Each entry mirrors a real caller,
 * so a change to the shared component is visible against the whole set at once.
 */
const meta = {
  title: "Shared/Top bars",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

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

export const AllTopBars: Story = {
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
        <InfoBanner
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
        <InfoBanner
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
        <InfoBanner
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
        <InfoBanner
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
        <InfoBanner
          icon="picture-as-pdf-rounded"
          message="Make Stirling PDF your default application for opening PDF files."
          buttonText="Set Default"
          onButtonClick={() => {}}
          secondaryButtonText="Don't remind me again"
          onSecondaryButtonClick={() => {}}
        />
      </Row>

      <Row caption="Danger tone (available, no caller yet)">
        <InfoBanner
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
