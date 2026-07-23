import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { InfoBanner } from "@app/components/shared/InfoBanner";
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
    <InfoBanner
      icon="picture-as-pdf-rounded"
      message={t(
        "defaultApp.prompt.message",
        "Make Stirling PDF your default application for opening PDF files.",
      )}
      buttonText={t("defaultApp.setDefault", "Set Default")}
      buttonIcon="check-circle-rounded"
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
