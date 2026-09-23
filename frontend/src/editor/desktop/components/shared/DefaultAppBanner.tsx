import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppBanner } from "@app/components/shared/AppBanner";
import { useDefaultApp } from "@app/hooks/useDefaultApp";

export const DefaultAppBanner: React.FC = () => {
  const { t } = useTranslation();
  const {
    isDefault,
    isLoading,
    promptDismissed,
    handleSetDefault,
    dontRemindAgain,
  } = useDefaultApp();
  const [sessionDismissed, setSessionDismissed] = useState(false);

  return (
    <AppBanner
      icon="file-text"
      message={t(
        "defaultApp.prompt.message",
        "Make Stirling PDF your default application for opening PDF files.",
      )}
      buttonText={t("defaultApp.setDefault", "Set Default")}
      buttonIcon="circle-check"
      onButtonClick={handleSetDefault}
      secondaryButtonText={t(
        "defaultApp.prompt.dontRemind",
        "Don't remind me again",
      )}
      onSecondaryButtonClick={dontRemindAgain}
      onDismiss={() => setSessionDismissed(true)}
      loading={isLoading}
      show={!sessionDismissed && !promptDismissed && isDefault === false}
    />
  );
};
