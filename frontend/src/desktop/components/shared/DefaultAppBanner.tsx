import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { InfoBanner } from "@app/components/shared/InfoBanner";
import { useDefaultApp } from "@app/hooks/useDefaultApp";

export const DefaultAppBanner: React.FC = () => {
  const { t } = useTranslation();
  const { isLoading, showPrompt, handleSetDefault, dismissPromptTemporarily, dismissPromptPermanently } = useDefaultApp();
  const [dismissed, setDismissed] = useState(false);

  const handleDismissPrompt = () => {
    dismissPromptTemporarily();
    setDismissed(true);
  };

  const handleDontAskAgain = () => {
    dismissPromptPermanently();
    setDismissed(true);
  };

  return (
    <InfoBanner
      icon="picture-as-pdf-rounded"
      message={t("defaultApp.prompt.message", "Make Stirling PDF your default application for opening PDF files.")}
      buttonText={t("defaultApp.setDefault", "Set Default")}
      buttonIcon="check-circle-rounded"
      onButtonClick={handleSetDefault}
      secondaryButtonText={t("defaultApp.dontAskAgain", "Don't ask again")}
      secondaryButtonIcon="block-rounded"
      onSecondaryButtonClick={handleDontAskAgain}
      onDismiss={handleDismissPrompt}
      loading={isLoading}
      show={!dismissed && showPrompt}
    />
  );
};
