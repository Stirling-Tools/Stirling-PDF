import React from "react";

interface ToolIconProps {
  icon: React.ReactNode;
  opacity?: number;
  color?: string;
  marginRight?: string;
}

/**
 * Shared icon component for consistent tool icon styling across the application.
 * Uses the same visual pattern as ToolButton: scaled to 0.8, centered transform, consistent spacing.
 */
export const ToolIcon: React.FC<ToolIconProps> = ({
  icon,
  opacity = 1,
  color = "var(--tools-text-and-icon-color)",
  marginRight = "0.5rem"
}) => {
  return (
    <div
      className="tool-button-icon"
      style={{
        color,
        marginRight,
        transform: "scale(0.8)",
        transformOrigin: "center",
        opacity
      }}
    >
      {icon}
    </div>
  );
};
