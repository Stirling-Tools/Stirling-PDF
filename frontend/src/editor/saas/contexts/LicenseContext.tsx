import type { ReactNode } from "react";
import { LicenseProvider as InstalledLicenseProvider } from "@proprietary/contexts/LicenseContext";
export {
  useLicense,
  useOptionalLicense,
} from "@proprietary/contexts/LicenseContext";

/** SaaS checkout shares the context contract without accessing the host's installation licence. */
export function LicenseProvider({ children }: { children: ReactNode }) {
  return (
    <InstalledLicenseProvider enabled={false}>
      {children}
    </InstalledLicenseProvider>
  );
}
