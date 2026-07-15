import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Divider } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { mapLicenseToTier } from "@app/services/licenseService";
import usageAnalyticsService from "@app/services/usageAnalyticsService";
import { useLicense } from "@app/contexts/LicenseContext";
import { useAuth } from "@app/auth/context";
import WorkspacePlanSnapshot, {
  type WorkspacePlanSnapshotRow,
} from "@app/components/shared/config/WorkspacePlanSnapshot";
import LicenseKeySection from "@app/components/shared/config/configSections/plan/LicenseKeySection";
import { InfoBanner } from "@app/components/shared/InfoBanner";
import { useLicenseAlert } from "@app/hooks/useLicenseAlert";
import { useLoginRequired } from "@app/hooks/useLoginRequired";
import LoginRequiredBanner from "@core/components/shared/config/LoginRequiredBanner";
import { PORTAL_USAGE_PATH } from "@app/routes/portalBasename";

interface AdminPlanSectionProps {
  /** Closes the settings modal before deep-linking to the portal. */
  onRequestClose?: () => void;
}

/**
 * "Plan" settings page. Plan management and billing now live in the PDF
 * Processor (portal); this page is a read-only mirror of the workspace's plan
 * and usage that deep-links out to the portal's Usage & Billing view. The
 * self-hosted license key still lives here so admins can activate/rotate keys.
 */
const AdminPlanSection: React.FC<AdminPlanSectionProps> = ({
  onRequestClose,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { loginEnabled } = useLoginRequired();
  const { licenseInfo } = useLicense();
  const { portalAccess } = useAuth();
  const licenseAlert = useLicenseAlert();

  const [operations, setOperations] = useState<number | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    usageAnalyticsService
      .getEndpointStatistics()
      .then((res) => {
        if (!cancelled) setOperations(res.totalVisits);
      })
      .catch(() => {
        if (!cancelled) setOperations(null);
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tier = mapLicenseToTier(licenseInfo);
  const tierLabel =
    tier === "enterprise"
      ? t("plan.enterprise.name", "Enterprise")
      : tier === "server"
        ? t("plan.server.name", "Server")
        : t("plan.free.name", "Free");

  // Fall back to the free-tier limit only on the free tier — server/enterprise
  // are unlimited unless the licence pins an explicit seat count, so we must not
  // show them the free cap of 5.
  const seatLimit =
    licenseInfo?.maxUsers ??
    (tier === "free" ? (licenseAlert.freeTierLimit ?? null) : null);
  const totalUsers = licenseAlert.totalUsers;

  const rows: WorkspacePlanSnapshotRow[] = useMemo(
    () => [
      {
        label: t("plan.snapshot.users", "Users"),
        value: totalUsers != null ? totalUsers.toLocaleString() : "—",
        sub:
          seatLimit != null
            ? t("plan.snapshot.ofSeats", "of {{count}} seats", {
                count: seatLimit,
              })
            : t("plan.snapshot.unlimitedSeats", "Unlimited seats"),
      },
      {
        label: t("plan.snapshot.operations", "Operations run"),
        value: operations != null ? operations.toLocaleString() : "—",
        sub: t("plan.snapshot.acrossTools", "Across all tools"),
      },
      {
        label: t("plan.snapshot.deployment", "Deployment"),
        value: t("plan.snapshot.selfHosted", "Self-hosted"),
        sub: t("plan.snapshot.yourInfrastructure", "Your infrastructure"),
      },
      {
        label: t("plan.snapshot.audit", "Audit logging"),
        value:
          tier === "enterprise" ? t("plan.snapshot.enabled", "Enabled") : "—",
        sub: t("plan.snapshot.enterpriseFeature", "Enterprise feature"),
      },
    ],
    [t, totalUsers, seatLimit, operations, tier],
  );

  const handleManage = useCallback(() => {
    onRequestClose?.();
    navigate(PORTAL_USAGE_PATH);
  }, [navigate, onRequestClose]);

  const shouldShowLicenseWarning =
    licenseAlert.active && licenseAlert.audience === "admin";
  const formattedUserCount = useMemo(() => {
    if (licenseAlert.totalUsers == null) {
      return t("plan.licenseWarning.overLimit", "more than {{limit}}", {
        limit: licenseAlert.freeTierLimit,
      });
    }
    return licenseAlert.totalUsers.toLocaleString();
  }, [licenseAlert.totalUsers, licenseAlert.freeTierLimit, t]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <LoginRequiredBanner show={!loginEnabled} />

      {shouldShowLicenseWarning && (
        <InfoBanner
          icon="warning-rounded"
          tone="warning"
          title={t(
            "plan.licenseWarning.title",
            "Free self-hosted limit reached",
          )}
          message={t("plan.licenseWarning.body", {
            total: formattedUserCount,
            limit: licenseAlert.freeTierLimit,
          })}
          // Only offer the CTA when there's a portal to send them to; without
          // portal access /processor/usage doesn't resolve.
          buttonText={
            portalAccess ? t("plan.licenseWarning.cta", "See plans") : undefined
          }
          buttonIcon="upgrade-rounded"
          onButtonClick={portalAccess ? handleManage : undefined}
          dismissible={false}
          minHeight={68}
          background="#FFF4E6"
          borderColor="var(--mantine-color-orange-7)"
          textColor="#9A3412"
          iconColor="#EA580C"
          buttonVariant="filled"
          buttonColor="orange.7"
        />
      )}

      <WorkspacePlanSnapshot
        bannerTitle={t("plan.snapshot.readOnly.title", "Read-only snapshot")}
        bannerMessage={t(
          "plan.snapshot.readOnly.body",
          "Plan and usage are governed in the PDF Processor. This mirrors the workspace's current state.",
        )}
        currentPlanLabel={t("plan.snapshot.currentPlan", "Current plan")}
        tierLabel={tierLabel}
        statusLabel={t("plan.snapshot.active", "Active")}
        rows={rows}
        ctaLabel={t("plan.snapshot.manageCta", "Manage in Usage & Billing")}
        canManage={portalAccess}
        onManage={handleManage}
        cannotManageHint={t(
          "plan.snapshot.readOnlyHint",
          "This is read-only, ask a workspace admin to make changes.",
        )}
        loading={statsLoading}
      />

      <Divider />

      {/* License Key Section */}
      <LicenseKeySection currentLicenseInfo={licenseInfo ?? undefined} />
    </div>
  );
};

export default AdminPlanSection;
