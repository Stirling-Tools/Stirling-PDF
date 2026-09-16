import React from "react";
import { Box } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
export interface NavigationArrowsProps {
  onPrevious: () => void;
  onNext: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

const NavigationArrows: React.FC<NavigationArrowsProps> = ({
  onPrevious,
  onNext,
  disabled = false,
  children,
}) => {
  const { t } = useTranslation();
  const navigationArrowStyle = {
    position: "absolute" as const,
    top: "50%",
    transform: "translateY(-50%)",
    zIndex: 10,
  };

  return (
    <Box style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Left Navigation Arrow */}
      <ActionIcon
        variant="secondary"
        size="sm"
        onClick={onPrevious}
        disabled={disabled}
        aria-label={t("common.previous", "Previous")}
        style={{
          ...navigationArrowStyle,
          left: "0",
        }}
      >
        <Icon name="chevron-left" />
      </ActionIcon>

      {/* Content */}
      <Box
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </Box>

      {/* Right Navigation Arrow */}
      <ActionIcon
        variant="secondary"
        size="sm"
        onClick={onNext}
        disabled={disabled}
        aria-label={t("common.next", "Next")}
        style={{
          ...navigationArrowStyle,
          right: "0",
        }}
      >
        <Icon name="chevron-right" />
      </ActionIcon>
    </Box>
  );
};

export default NavigationArrows;
