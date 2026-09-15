import { withBasePath } from "@app/constants/app";
import { useNavigate } from "react-router-dom";
import { toProcessorPath } from "@processor/contexts/ViewContext";
import { Usage } from "@processor/views/Usage";

/**
 * SaaS billing gate: there is no link concept — the signed-in account IS the SaaS
 * account (auth is handled upstream by ProcessorAuthBoundary), so render the Usage
 * page directly. No link state, no prompt.
 *
 * onReauth sends the user back to the editor's Supabase login if the session
 * lapses mid-view: ProcessorAuthBoundary only re-gates on mount / session change, so
 * without this a "Session expired" notice would dead-end until a manual reload.
 */
export function ProcessorBillingGate() {
  const navigate = useNavigate();
  return (
    <Usage
      onEnterpriseQuote={() => navigate(toProcessorPath("/procurement"))}
      onReauth={() => {
        window.location.href = withBasePath("/login");
      }}
    />
  );
}
