import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Center, Divider, Loader } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useLicense } from "@app/contexts/LicenseContext";
import { useAuth } from "@app/auth/context";
import WorkspacePlanSnapshot from "@app/components/shared/config/WorkspacePlanSnapshot";
import { buildPlanSnapshotRows } from "@app/components/shared/config/planSnapshotRows";
import PlanLinkPrompt from "@app/components/shared/config/PlanLinkPrompt";
import { useSourcesCount } from "@app/hooks/useSourcesCount";
import LicenseKeySection from "@app/components/shared/config/configSections/plan/LicenseKeySection";
import { InfoBanner } from "@app/components/shared/InfoBanner";
import { useLicenseAlert } from "@app/hooks/useLicenseAlert";
import { useLoginRequired } from "@app/hooks/useLoginRequired";
import LoginRequiredBanner from "@core/components/shared/config/LoginRequiredBanner";
import { PORTAL_USAGE_PATH } from "@app/routes/portalBasename";
import { fetchWallet } from "@portal/api/billing";
import type { Wallet } from "@app/billing";

interface AdminPlanSectionProps {
  /** Closes the settings modal before deep-linking to the portal. */
  onRequestClose?: () => void;
}

/** Wallet load outcome: showing the card, or prompting the admin to link. */
type WalletState =
  | { status: "loading" }
  | { status: "linked"; wallet: Wallet }
  | { status: "unlinked" };

/**
 * "Plan & Usage" settings page. Plan management and billing live in the PDF
 * Processor (portal); this page mirrors the linked account's plan and usage and
 * deep-links out to the portal's Usage & Billing view. When the instance isn't
 * linked to a Stirling account yet, it shows a link CTA instead (metered usage
 * and billing only exist once linked). The self-hosted license key still lives
 * here so admins can activate/rotate keys.
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
  const { count: sourcesCount } = useSourcesCount();

  // The wallet lives on the linked SaaS account; apiClient.saas throws when the
  // instance isn't linked (or SaaS isn't configured), which we treat as unlinked.
  const [walletState, setWalletState] = useState<WalletState>({
    status: "loading",
  });

  useEffect(() => {
    let cancelled = false;
    setWalletState({ status: "loading" });
    fetchWallet()
      .then((wallet) => {
        if (!cancelled) setWalletState({ status: "linked", wallet });
      })
      .catch(() => {
        // SaasNotLinkedError / SaasUnconfiguredError / transient — all resolve to
        // "no billing to show here yet", so prompt the admin to link.
        if (!cancelled) setWalletState({ status: "unlinked" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

      {walletState.status === "loading" && (
        <Center mih={160}>
          <Loader />
        </Center>
      )}

      {walletState.status === "linked" && (
        <WorkspacePlanSnapshot
          currentPlanLabel={t("plan.snapshot.currentPlan", "Current plan")}
          tierLabel={
            walletState.wallet.status === "subscribed"
              ? t("plan.tier.processor", "Processor")
              : t("plan.tier.editor", "Editor")
          }
          statusLabel={t("plan.snapshot.active", "Active")}
          rows={buildPlanSnapshotRows(walletState.wallet, t, { sourcesCount })}
          ctaLabel={t("plan.snapshot.manageCta", "Manage in Usage & Billing")}
          canManage={portalAccess}
          onManage={handleManage}
          cannotManageHint={t(
            "plan.snapshot.readOnlyHint",
            "This is read-only, ask a workspace admin to make changes.",
          )}
        />
      )}

      {walletState.status === "unlinked" && (
        <PlanLinkPrompt
          title={t("plan.link.title", "Link your Stirling account")}
          body={t(
            "plan.link.body",
            "Manual PDF editing is always free. Link this instance to a Stirling account to see metered usage and billing, and to claim your free processing allowance.",
          )}
          ctaLabel={t("plan.link.cta", "Link Stirling account")}
          onLink={handleManage}
        />
      )}

      <Divider />

      {/* License Key Section */}
      <LicenseKeySection currentLicenseInfo={licenseInfo ?? undefined} />
    </div>
  );
};

export default AdminPlanSection;
