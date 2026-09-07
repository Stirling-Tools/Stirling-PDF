import type { Meta, StoryObj } from "@storybook/react-vite";
import type { FailureActionOffer } from "@portal/api/fileRunEvents";
import { FILE_RUN_EVENTS } from "@portal/mocks/fileRunEvents";
import { FailureActionButtons } from "@portal/components/failures/FailureActionButtons";
import "@portal/components/failures/failures.css";

const OPEN_EVENT = FILE_RUN_EVENTS[0];

const meta: Meta<typeof FailureActionButtons> = {
  title: "Portal/Failures/FailureActionButtons",
  component: FailureActionButtons,
  parameters: { layout: "padded" },
  args: { event: OPEN_EVENT, onAction: () => {} },
};
export default meta;
type Story = StoryObj<typeof FailureActionButtons>;

/**
 * Labels come from the server's per-kind overrides, so a password failure reads
 * "I'll unlock this" and "Skip this file" rather than the generic wording.
 */
export const PerKindLabels: Story = {};

/** The generic labels, used by any kind that declares no override. */
export const GenericLabels: Story = {
  args: { event: FILE_RUN_EVENTS[1] },
};

/** A closed incident keeps its buttons, disabled with a reason, so the reviewer
 * can still see what was possible. */
export const Closed: Story = {
  args: { event: FILE_RUN_EVENTS[2] },
};

/** An action mid-flight. */
export const Busy: Story = {
  args: { busyActionId: "ACKNOWLEDGE" },
};

/**
 * An action id this build does not implement is skipped rather than rendered
 * unwired, since the server can be newer than the client (notably on desktop).
 */
export const UnknownActionIsSkipped: Story = {
  args: {
    event: {
      ...OPEN_EVENT,
      actions: [
        ...OPEN_EVENT.actions,
        {
          id: "REMEDIATE_AND_RETRY",
          labelKey: "portal.failures.action.remediateAndRetry",
          enabled: true,
          disabledReasonKey: null,
        } satisfies FailureActionOffer,
      ],
    },
  },
};
