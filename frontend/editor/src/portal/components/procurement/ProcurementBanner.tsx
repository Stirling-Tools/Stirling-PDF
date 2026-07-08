import { useTranslation } from "react-i18next";
import { Button, Card } from "@app/ui";
import { useView } from "@portal/contexts/ViewContext";
import { DealStatusHero } from "@portal/components/procurement/DealStatusHero";
import type { ProcurementController } from "@portal/components/procurement/useProcurement";

/**
 * The deal-status hero, wired to a shared ProcurementController. Rendered both
 * standalone (the /procurement route) and as the Home hero card's footer once a
 * deal is underway. Assumes an active deal (controller.data present).
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
      onExpand={() => controller.setOpen(true)}
      onKeyDocs={() => controller.setExtra("docs")}
      onInvite={() => setActiveView("users")}
      onSchedule={() => controller.setExtra("schedule")}
      onManageTrial={() => controller.setExtra("trial")}
      onNavigate={setActiveView}
    />
  );
}

/**
 * Enterprise on-ramp shown when no deal exists yet. Only used on the dedicated
 * /procurement route — on Home the setup checklist's Enterprise rung owns the
 * on-ramp, so this doesn't render there.
 */
export function ProcurementUpsell({
  controller,
}: {
  controller: ProcurementController;
}) {
  const { t } = useTranslation();
  return (
    <Card className="portal-proc__upsell">
      <div className="portal-proc__upsell-text">
        <span className="portal-proc__upsell-badge">
          {t("portal.procurement.upsell.homeBadge")}
        </span>
        <p className="portal-proc__upsell-copy">
          <strong>{t("portal.procurement.upsell.homeHeadline")} </strong>
          {t("portal.procurement.upsell.homeBody")}
        </p>
      </div>
      <Button
        variant="secondary"
        accent="default"
        loading={controller.busy}
        disabled={!controller.isLinked}
        onClick={controller.onStartTrial}
      >
        {t("portal.procurement.upsell.homeCta")}
      </Button>
    </Card>
  );
}

/** Deal-status hero when a deal is underway, otherwise the enterprise on-ramp. */
export function ProcurementBanner({
  controller,
}: {
  controller: ProcurementController;
}) {
  return controller.isLinked && controller.started && controller.data ? (
    <ControlledDealStatusHero controller={controller} />
  ) : (
    <ProcurementUpsell controller={controller} />
  );
}
