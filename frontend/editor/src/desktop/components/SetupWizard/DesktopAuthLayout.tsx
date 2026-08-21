import React from "react";
import { AuthShell } from "@app/auth/ui/AuthShell";

interface DesktopAuthLayoutProps {
  children: React.ReactNode;
}

export const DesktopAuthLayout: React.FC<DesktopAuthLayoutProps> = ({
  children,
}) => {
  return <AuthShell>{children}</AuthShell>;
};
