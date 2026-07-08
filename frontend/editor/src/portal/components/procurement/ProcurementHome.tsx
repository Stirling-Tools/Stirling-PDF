import { ProcurementBanner } from "@portal/components/procurement/ProcurementBanner";
import { ProcurementFlow } from "@portal/components/procurement/ProcurementFlow";
import { useProcurement } from "@portal/components/procurement/useProcurement";
import "@portal/views/Procurement.css";

/**
 * The standalone procurement experience: a deal-status hero (or enterprise
 * on-ramp when no deal exists) above the full-screen takeover flow that holds
 * the journey — build + issue a quote, review + agree to the enterprise
 * agreement, then accept into a committed subscription. Rendered at
 * /procurement (autoOpen). On Home the deal-status hero instead attaches to the
 * tier hero card's footer (see HomeHero) so this component isn't used there.
 */
export function ProcurementHome({ autoOpen = false }: { autoOpen?: boolean }) {
  const controller = useProcurement(autoOpen);
  return (
    <>
      <ProcurementBanner controller={controller} />
      <ProcurementFlow controller={controller} />
    </>
  );
}
