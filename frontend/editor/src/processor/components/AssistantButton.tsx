import { useTranslation } from "react-i18next";
import { useUI } from "@processor/contexts/UIContext";
import { SparklesIcon } from "@processor/components/icons";
import { Button } from "@app/ui/Button";
import "@processor/components/AssistantButton.css";

export function AssistantButton() {
  const { assistantOpen, toggleAssistant } = useUI();
  const { t } = useTranslation();
  return (
    <Button
      variant="tertiary"
      className={
        "processor-assistant-btn" + (assistantOpen ? " is-active" : "")
      }
      onClick={toggleAssistant}
      aria-label={
        assistantOpen
          ? t("processor.assistant.close")
          : t("processor.assistant.open")
      }
      aria-expanded={assistantOpen}
      title={t("processor.assistant.title")}
    >
      {assistantOpen ? (
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      ) : (
        <SparklesIcon size={22} />
      )}
    </Button>
  );
}
