import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import type {
  FailureActionOffer,
  FileRunEvent,
} from "@processor/api/fileRunEvents";

/**
 * Renders a row's action buttons from the data the server sent, knowing nothing about
 * individual failure kinds. Two client-side rules: an id this build cannot handle is
 * skipped rather than rendered unwired, and closing an incident confirms first.
 */

/** Actions this build can actually perform. Anything else is skipped. */
const HANDLED_ACTIONS = new Set(["ACKNOWLEDGE", "DISMISS"]);

/** Actions that close the incident, so they warrant a confirmation step. */
const CONFIRMING_ACTIONS = new Set(["DISMISS"]);

interface FailureActionButtonsProps {
  event: FileRunEvent;
  onAction: (actionId: string) => void | Promise<void>;
  busyActionId?: string | null;
}

export function FailureActionButtons({
  event,
  onAction,
  busyActionId,
}: FailureActionButtonsProps) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState<string | null>(null);

  const renderable = event.actions.filter((action) =>
    HANDLED_ACTIONS.has(action.id),
  );
  if (renderable.length === 0) return null;

  const labelFor = (action: FailureActionOffer) =>
    // The server's key first, falling back to the generic label for this action.
    t(action.labelKey, {
      defaultValue: t(
        `processor.failures.action.${action.id.toLowerCase()}`,
        action.id,
      ),
    });

  return (
    <div className="processor-failures__actions">
      {renderable.map((action) => {
        const isConfirming = confirming === action.id;
        const busy = busyActionId === action.id;
        const disabled = !action.enabled || busy;

        return (
          <Button
            key={action.id}
            variant={isConfirming ? "primary" : "secondary"}
            disabled={disabled}
            aria-label={
              action.enabled
                ? undefined
                : `${labelFor(action)} — ${t(
                    action.disabledReasonKey ??
                      "processor.failures.disabled.unavailable",
                    "unavailable",
                  )}`
            }
            title={
              action.enabled
                ? undefined
                : t(
                    action.disabledReasonKey ??
                      "processor.failures.disabled.unavailable",
                    "unavailable",
                  )
            }
            onClick={() => {
              if (CONFIRMING_ACTIONS.has(action.id) && !isConfirming) {
                setConfirming(action.id);
                return;
              }
              setConfirming(null);
              void onAction(action.id);
            }}
          >
            {isConfirming
              ? t("processor.failures.action.confirm", "Are you sure?")
              : labelFor(action)}
          </Button>
        );
      })}
    </div>
  );
}
