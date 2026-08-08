import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactElement } from "react";
import UpdateSeatsButton from "@app/components/shared/UpdateSeatsButton";
import UpdateSeatsContext from "@app/contexts/UpdateSeatsContext";

/**
 * The "Update Seats" entry point on enterprise licences. It owns no state of its
 * own: pressing it asks the seat-update flow to open, and the only thing that
 * changes its appearance is that flow reporting work in progress — while a seat
 * change is being prepared (a licence read, then a redirect to the Stripe
 * billing portal) the button shows its loading state.
 *
 * Everything else on it is pass-through Button styling, so those belong to the
 * shared Button's own stories rather than here.
 */

/** Stands in for the seat-update flow; only these four fields are read. */
function withSeatsFlow(isLoading: boolean) {
  return function SeatsFlowDecorator(Story: () => ReactElement) {
    return (
      <UpdateSeatsContext.Provider
        value={{
          openUpdateSeats: async () => {},
          closeUpdateSeats: () => {},
          isOpen: false,
          isLoading,
        }}
      >
        <Story />
      </UpdateSeatsContext.Provider>
    );
  };
}

const meta: Meta<typeof UpdateSeatsButton> = {
  title: "Shared/UpdateSeatsButton",
  component: UpdateSeatsButton,
  parameters: { layout: "centered" },
};
export default meta;
type Story = StoryObj<typeof UpdateSeatsButton>;

/** Idle — the secondary-variant button awaiting a press. */
export const Default: Story = {
  decorators: [withSeatsFlow(false)],
};

/** The seat-update flow is preparing the billing-portal redirect. */
export const Loading: Story = {
  decorators: [withSeatsFlow(true)],
};
