import { useView } from "@portal/contexts/ViewContext";
import { DealStatusHero } from "@portal/components/procurement/DealStatusHero";
import type { ProcurementController } from "@portal/components/procurement/useProcurement";

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
  const { setActiveView } = useView();
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
      onInvite={() => setActiveView("users")}
      onSchedule={() => controller.setExtra("schedule")}
      onManageTrial={() => controller.setExtra("trial")}
      onDocuments={() => controller.setExtra("documents")}
    />
  );
}
