import { useEffect, useState } from "react";
import { useLicense } from "@app/contexts/LicenseContext";
import { usersBackend } from "@app/portal/usersBackend";
import type { ServerPlan } from "@app/billing/serverPlan";

/** Installed licences own this billing view; account-purchased Team uses the wallet despite sharing SERVER features. */
export function useServerPlan(enabled: boolean) {
  const { licenseInfo, loading } = useLicense();
  const [usersInUse, setUsersInUse] = useState<number | null>(null);
  const installedKey = licenseInfo?.licenseKey?.trim();
  const licenseType =
    enabled &&
    licenseInfo?.enabled &&
    licenseInfo.hasKey &&
    installedKey &&
    installedKey !== "00000000-0000-0000-0000-000000000000" &&
    licenseInfo.licenseType !== "NORMAL"
      ? licenseInfo.licenseType
      : null;
  useEffect(() => {
    let cancelled = false;
    setUsersInUse(null);
    const refreshUsers = () => {
      if (!enabled) return;
      usersBackend
        .fetchUsers(licenseType === "ENTERPRISE" ? "enterprise" : "pro")
        .then(({ summary }) => {
          if (!cancelled) setUsersInUse(summary.seatsUsed);
        })
        .catch(() => {
          if (!cancelled) setUsersInUse(null);
        });
    };
    refreshUsers();
    window.addEventListener("focus", refreshUsers);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshUsers);
    };
  }, [enabled, licenseType, licenseInfo]);
  const serverPlan: ServerPlan | undefined =
    licenseType && licenseInfo
      ? { licenseType, maxUsers: licenseInfo.maxUsers, usersInUse }
      : undefined;
  return { serverPlan, usersInUse, loading: loading && !licenseInfo };
}
