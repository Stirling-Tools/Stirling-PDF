import { ReactNode } from "react";
import { AppProviders as CoreAppProviders } from "@core/components/AppProviders";
import { AuthProvider } from "@app/auth/UseSession";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <CoreAppProviders>
      <AuthProvider>
        {children}
      </AuthProvider>
    </CoreAppProviders>
  );
}
