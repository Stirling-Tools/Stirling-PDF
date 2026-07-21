import React from "react";
import { AuthShell } from "@app/auth/ui/AuthShell";
import Footer from "@app/components/shared/Footer";

interface AuthLayoutProps {
  children: React.ReactNode;
}

/**
 * Editor login layout. The card shell lives in shared so the portal renders
 * the identical screen; this wires the editor's legal/cookie footer into it.
 */
export default function AuthLayout({ children }: AuthLayoutProps) {
  return <AuthShell footer={<Footer />}>{children}</AuthShell>;
}
