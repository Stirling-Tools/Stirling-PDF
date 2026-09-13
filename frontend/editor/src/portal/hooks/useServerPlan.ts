import { useEffect, useState } from "react";
import { useLicense } from "@app/contexts/LicenseContext";
import { usersBackend } from "@app/portal/usersBackend";
import type { ServerPlan } from "@app/billing/serverPlan";

/** Read local entitlements only in the self-hosted administrator's billing gate. */
export function useServerPlan(enabled: boolean) {
  const { licenseInfo, loading } = useLicense();
  const [usersInUse, setUsersInUse] = useState<number | null>(null);
  const licenseType =
    enabled && licenseInfo?.enabled && licenseInfo.licenseType !== "NORMAL"
      ? licenseInfo.licenseType
      : null;
  useEffect(() => {
    let cancelled = false;
    setUsersInUse(null);
    if (licenseType) {
      usersBackend
        .fetchUsers(licenseType === "ENTERPRISE" ? "enterprise" : "pro")
        .then(({ summary }) => {
          if (!cancelled) setUsersInUse(summary.seatsUsed);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [licenseType, licenseInfo]);
  const serverPlan: ServerPlan | undefined =
    licenseType && licenseInfo
      ? { licenseType, maxUsers: licenseInfo.maxUsers, usersInUse }
      : undefined;
  return { serverPlan, loading: loading && !licenseInfo };
}
