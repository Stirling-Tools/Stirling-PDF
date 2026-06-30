import React from "react";
import { Box } from "@mantine/core";
import { ActionIcon } from "@shared/components/ActionIcon";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

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
        aria-label="Previous"
        style={{
          ...navigationArrowStyle,
          left: "0",
        }}
      >
        <ChevronLeftIcon />
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
        aria-label="Next"
        style={{
          ...navigationArrowStyle,
          right: "0",
        }}
      >
        <ChevronRightIcon />
      </ActionIcon>
    </Box>
  );
};

export default NavigationArrows;
