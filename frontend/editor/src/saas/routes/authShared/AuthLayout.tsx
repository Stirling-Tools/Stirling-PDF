import React from "react";
import { AuthShell } from "@app/auth/ui/AuthShell";
import Footer from "@app/components/shared/Footer";

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return <AuthShell footer={<Footer analyticsEnabled />}>{children}</AuthShell>;
}
