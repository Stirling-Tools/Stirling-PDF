import { useUI } from "@processor/contexts/UIContext";
import { DealStatusHero } from "@processor/components/procurement/DealStatusHero";
import type { ProcurementController } from "@processor/components/procurement/useProcurement";

/**
 * The deal-status hero and the dialogs must share the same controller instance.
 */
export function ControlledDealStatusHero({
  controller,
  readOnly = false,
}: {
  controller: ProcurementController;
  readOnly?: boolean;
}) {
  const { openSettings } = useUI();
  if (!controller.data) return null;
  return (
    <DealStatusHero
      snapshot={controller.data}
      readOnly={readOnly}
      busy={controller.busy}
      canSchedule={controller.isLinked}
      onExpand={() =>
        // Exploring has no journey to expand into yet — its ask is to set the trial up.
        controller.stage === "exploring"
          ? controller.onStartTrial()
          : controller.setOpen(true)
      }
      onAcceptQuote={() => void controller.onAcceptQuote()}
      onLicense={() => controller.setExtra("license")}
      onInvite={() => openSettings("users")}
      onSchedule={() => controller.setExtra("schedule")}
      onManageTrial={() => controller.setExtra("trial")}
      onDocuments={() => controller.setExtra("documents")}
    />
  );
}
