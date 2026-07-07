import { Usage } from "@portal/views/Usage";

/**
 * SaaS billing gate: there is no link concept — the signed-in account IS the SaaS
 * account (auth is handled upstream by PortalAuthBoundary), so render the Usage
 * page directly. No link state, no prompt.
 *
 * onReauth sends the user back to the editor's Supabase login if the session
 * lapses mid-view: PortalAuthBoundary only re-gates on mount / session change, so
 * without this a "Session expired" notice would dead-end until a manual reload.
 */
export function PortalBillingGate() {
  return (
    <Usage
      onReauth={() => {
        window.location.href = "/login";
      }}
    />
  );
}
