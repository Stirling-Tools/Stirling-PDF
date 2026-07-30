import { useView } from "@portal/contexts/ViewContext";
import { DealStatusHero } from "@portal/components/procurement/DealStatusHero";
import type { ProcurementController } from "@portal/components/procurement/useProcurement";

/**
 * The deal-status hero, wired to a shared ProcurementController. Rendered as the Home hero card's
 * footer once a deal is underway; assumes an active deal (controller.data present).
 */
export function ControlledDealStatusHero({
  controller,
}: {
  controller: ProcurementController;
}) {
  const { setActiveView } = useView();
  if (!controller.data) return null;
  return (
    <DealStatusHero
      snapshot={controller.data}
      busy={controller.busy}
      canSchedule={controller.isLinked}
      onExpand={() =>
        // Exploring has no journey to expand into yet — its ask is to set the trial up.
        controller.stage === "exploring"
          ? controller.onStartTrial()
          : controller.setOpen(true)
      }
      onLicense={() => controller.setExtra("license")}
      onInvite={() => setActiveView("users")}
      onSchedule={() => controller.setExtra("schedule")}
      onManageTrial={() => controller.setExtra("trial")}
      onDocuments={() => controller.setExtra("documents")}
    />
  );
}

/**
 * Enterprise on-ramp shown when no deal exists yet. Only used on the dedicated
 * /procurement route — on Home the setup checklist's Enterprise rung owns the
 * on-ramp, so this doesn't render there.
 */
