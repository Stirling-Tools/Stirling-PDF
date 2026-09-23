import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import { screen } from "storybook/test";
import { Review } from "@portal/views/Review";

const meta: Meta<typeof Review> = {
  title: "Portal/Views/Review",
  component: Review,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Review>;

/** Seeded mock data: a classified issue, an unclassified one, a repeat, and a closed row. */
export const Default: Story = {};

/** The settled half of the queue, with each row's outcome and who closed it. */
export const Closed: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findAllByText("Password-protected document");
    await userEvent.click(await canvas.findByText("Closed"));
    await canvas.findByText("Outcome");
  },
};

/** A facet menu open: multi-select, with the row count each value would keep. */
export const Filtering: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findAllByText("Password-protected document");
    await userEvent.click(
      await canvas.findByRole("button", { name: "Raised in", expanded: false }),
    );
  },
};

/** The raw error behind the row menu, so no row has to carry a diagnostic. */
export const ViewingError: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findAllByText("Password-protected document");
    await userEvent.click(
      (await canvas.findAllByRole("button", { name: "More options" }))[0]!,
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "View error" }),
    );
  },
};

/** Nothing needs attention: the queue is clear, not the workspace error-free. */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/v1/file-run-events", () =>
          HttpResponse.json({ events: [] }),
        ),
      ],
    },
  },
};

/** Reviewing is leader-only, so a member's read is refused and the screen says so. */
export const Refused: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("*/api/v1/file-run-events", () =>
          HttpResponse.json({ detail: "Forbidden" }, { status: 403 }),
        ),
      ],
    },
  },
};
