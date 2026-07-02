import { ProcurementHome } from "@portal/components/procurement/ProcurementHome";
import "@portal/views/Procurement.css";

/**
 * /procurement — procurement is no longer a nav tab; it lives on Home as the deal-status hero.
 * This route is kept for deep links (and the Usage "Build your quote" CTA): it renders the same
 * surface with the takeover modal auto-opened, so landing here starts the journey.
 */
export function Procurement() {
  return (
    <div className="portal-proc">
      <ProcurementHome autoOpen />
    </div>
  );
}
