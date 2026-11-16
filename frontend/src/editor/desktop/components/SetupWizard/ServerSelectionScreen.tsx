import React from "react";
import { useTranslation } from "react-i18next";
import LoginHeader from "@editor/routes/login/LoginHeader";
import ErrorMessage from "@editor/auth/ui/ErrorMessage";
import { ServerSelection } from "@editor/components/SetupWizard/ServerSelection";
import { ServerConfig } from "@editor/services/connectionModeService";
import "@editor/auth/ui/auth.css";

interface ServerSelectionScreenProps {
  onSelect: (config: ServerConfig) => void;
  loading: boolean;
  error: string | null;
}

export const ServerSelectionScreen: React.FC<ServerSelectionScreenProps> = ({
  onSelect,
  loading,
  error,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <LoginHeader
        title={t("setup.server.title", "Connect to Server")}
        subtitle={t(
          "setup.server.subtitle",
          "Enter your self-hosted server URL",
        )}
      />

      <ErrorMessage error={error} />

      <ServerSelection onSelect={onSelect} loading={loading} />
    </>
  );
};
