import { useTranslation } from "react-i18next";
import { useUI } from "@portal/contexts/UIContext";
import { Icon } from "@app/ui/Icon";
import { Button } from "@app/ui/Button";
import "@portal/components/AssistantButton.css";

export function AssistantButton() {
  const { assistantOpen, toggleAssistant } = useUI();
  const { t } = useTranslation();
  return (
    <Button
      variant="tertiary"
      className={"portal-assistant-btn" + (assistantOpen ? " is-active" : "")}
      onClick={toggleAssistant}
      aria-label={
        assistantOpen ? t("portal.assistant.close") : t("portal.assistant.open")
      }
      aria-expanded={assistantOpen}
      title={t("portal.assistant.title")}
    >
      {assistantOpen ? (
        <Icon name="x" size={20} strokeWidth={2} />
      ) : (
        <Icon name="sparkles" size={22} />
      )}
    </Button>
  );
}
