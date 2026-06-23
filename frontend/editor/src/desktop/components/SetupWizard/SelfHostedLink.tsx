import React from "react";
import { useTranslation } from "react-i18next";
import "@app/routes/authShared/auth.css";
import { Button } from "@shared/components/Button";

interface SelfHostedLinkProps {
  onClick: () => void;
  disabled?: boolean;
}

export const SelfHostedLink: React.FC<SelfHostedLinkProps> = ({
  onClick,
  disabled = false,
}) => {
  const { t } = useTranslation();

  return (
    <div className="navigation-link-container" style={{ marginTop: "1.5rem" }}>
      <Button
        variant="ghost"
        onClick={onClick}
        disabled={disabled}
        className="navigation-link-button"
      >
        {t("setup.selfhosted.link", "or connect to a self hosted account")}
      </Button>
    </div>
  );
};
