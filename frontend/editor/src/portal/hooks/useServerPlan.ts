import { useEffect, useState } from "react";
import { useLicense } from "@app/contexts/LicenseContext";
import { usersBackend } from "@app/portal/usersBackend";
import type { ServerPlan } from "@app/billing/serverPlan";

/** Reads installed-plan details and the local roster; keyless Team also needs the roster for seat usage. */
export function useServerPlan(enabled: boolean) {
  const { licenseInfo, loading } = useLicense();
  const [usersInUse, setUsersInUse] = useState<number | null>(null);
  const [userLimit, setUserLimit] = useState<number | null>(null);
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
    setUserLimit(null);
    const refreshUsers = () => {
      if (!enabled) return;
      usersBackend
        .fetchUsers(licenseType === "ENTERPRISE" ? "enterprise" : "pro")
        .then(({ summary }) => {
          if (!cancelled) {
            setUsersInUse(summary.seatsUsed);
            setUserLimit(summary.seatLimit);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setUsersInUse(null);
            setUserLimit(null);
          }
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
  return {
    serverPlan,
    usersInUse,
    userLimit,
    loading: loading && !licenseInfo,
  };
}
