import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import { useView } from "@portal/contexts/ViewContext";
import { AgentBuilderIcon } from "@portal/components/icons";

/**
 * The "Agent Builder" action in the Sources header. A flavor seam: the SaaS build
 * shadows this with a no-op (Agent Builder isn't shipped there yet).
 */
export function AgentBuilderAction() {
  const { t } = useTranslation();
  const { setActiveView } = useView();
  return (
    <Button
      variant="secondary"
      onClick={() => setActiveView("agent-builder")}
      leftSection={<AgentBuilderIcon size={16} />}
    >
      {t("portal.sources.actions.agentBuilder")}
    </Button>
  );
}
