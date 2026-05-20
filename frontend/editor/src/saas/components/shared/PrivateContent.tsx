import React from "react";

interface PrivateContentProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
}

/**
 * SaaS override of the OSS PrivateContent wrapper.
 * Adds both the PostHog no-capture class and the Userback opt-out class
 * while keeping the same API and layout behavior (display: contents).
 */
export const PrivateContent: React.FC<PrivateContentProps> = ({
  children,
  className = "",
  style,
  ...props
}) => {
  const baseClass = "ph-no-capture userback-block";
  const combinedClassName = className ? `${baseClass} ${className}` : baseClass;
  const combinedStyle = {
    display: "contents" as const,
    ...style,
  };

  return (
    <span className={combinedClassName} style={combinedStyle} {...props}>
      {children}
    </span>
  );
};
