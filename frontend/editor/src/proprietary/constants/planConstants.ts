import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { PlanFeature } from "@app/types/license";

/**
 * Shared plan feature definitions for Stirling PDF Self-Hosted
 * Used by both dynamic (Stripe) and static (fallback) plan displays.
 *
 * These are exposed as hooks so that every feature/highlight string can be
 * localized via `t()` while preserving the original shape.
 */

export interface PlanFeaturesMap {
  FREE: PlanFeature[];
  SERVER: PlanFeature[];
  ENTERPRISE: PlanFeature[];
}

export interface PlanHighlightsMap {
  FREE: string[];
  SERVER_MONTHLY: string[];
  SERVER_YEARLY: string[];
  ENTERPRISE_MONTHLY: string[];
  ENTERPRISE_YEARLY: string[];
}

export const usePlanFeatures = (): PlanFeaturesMap => {
  const { t } = useTranslation();

  return useMemo(() => {
    const selfHostedDeployment = t(
      "plan.features.selfHostedDeployment",
      "Self-hosted deployment",
    );
    const allPdfOperations = t(
      "plan.features.allPdfOperations",
      "All PDF operations",
    );
    const secureLoginSupport = t(
      "plan.features.secureLoginSupport",
      "Secure Login Support",
    );
    const communitySupport = t(
      "plan.features.communitySupport",
      "Community support",
    );
    const regularUpdates = t("plan.features.regularUpdates", "Regular updates");
    const upToFiveUsersLowercase = t(
      "plan.features.upToFiveUsersLowercase",
      "up to 5 users",
    );
    const upToFiveUsers = t("plan.features.upToFiveUsers", "Up to 5 users");
    const unlimitedUsers = t("plan.features.unlimitedUsers", "Unlimited users");
    const googleDriveIntegration = t(
      "plan.features.googleDriveIntegration",
      "Google drive integration",
    );
    const externalDatabase = t(
      "plan.features.externalDatabase",
      "External Database",
    );
    const editingTextInPdfs = t(
      "plan.features.editingTextInPdfs",
      "Editing text in pdfs",
    );
    const usersLimitedToSeats = t(
      "plan.features.usersLimitedToSeats",
      "Users limited to seats",
    );
    const sso = t("plan.features.sso", "SSO");
    const saml = t("plan.features.saml", "SAML");
    const auditing = t("plan.features.auditing", "Auditing");
    const usageTracking = t("plan.features.usageTracking", "Usage tracking");
    const prometheusSupport = t(
      "plan.features.prometheusSupport",
      "Prometheus Support",
    );
    const customPdfMetadata = t(
      "plan.features.customPdfMetadata",
      "Custom PDF metadata",
    );

    return {
      FREE: [
        { name: selfHostedDeployment, included: true },
        { name: allPdfOperations, included: true },
        { name: secureLoginSupport, included: true },
        { name: communitySupport, included: true },
        { name: regularUpdates, included: true },
        { name: upToFiveUsersLowercase, included: true },
        { name: unlimitedUsers, included: false },
        { name: googleDriveIntegration, included: false },
        { name: externalDatabase, included: false },
        { name: editingTextInPdfs, included: false },
        { name: usersLimitedToSeats, included: false },
        { name: sso, included: false },
        { name: saml, included: false },
        { name: auditing, included: false },
        { name: usageTracking, included: false },
        { name: prometheusSupport, included: false },
        { name: customPdfMetadata, included: false },
      ],
      SERVER: [
        { name: selfHostedDeployment, included: true },
        { name: allPdfOperations, included: true },
        { name: secureLoginSupport, included: true },
        { name: communitySupport, included: true },
        { name: regularUpdates, included: true },
        { name: upToFiveUsers, included: false },
        { name: unlimitedUsers, included: true },
        { name: googleDriveIntegration, included: true },
        { name: externalDatabase, included: true },
        { name: editingTextInPdfs, included: true },
        { name: usersLimitedToSeats, included: false },
        { name: sso, included: true },
        { name: saml, included: false },
        { name: auditing, included: false },
        { name: usageTracking, included: false },
        { name: prometheusSupport, included: false },
        { name: customPdfMetadata, included: false },
      ],
      ENTERPRISE: [
        { name: selfHostedDeployment, included: true },
        { name: allPdfOperations, included: true },
        { name: secureLoginSupport, included: true },
        { name: communitySupport, included: true },
        { name: regularUpdates, included: true },
        { name: upToFiveUsersLowercase, included: false },
        { name: unlimitedUsers, included: false },
        { name: googleDriveIntegration, included: true },
        { name: externalDatabase, included: true },
        { name: editingTextInPdfs, included: true },
        { name: usersLimitedToSeats, included: true },
        { name: sso, included: true },
        { name: saml, included: true },
        { name: auditing, included: true },
        { name: usageTracking, included: true },
        { name: prometheusSupport, included: true },
        { name: customPdfMetadata, included: true },
      ],
    };
  }, [t]);
};

export const usePlanHighlights = (): PlanHighlightsMap => {
  const { t } = useTranslation();

  return useMemo(() => {
    const selfHostedOnInfrastructure = t(
      "plan.highlights.selfHostedOnInfrastructure",
      "Self-hosted on your infrastructure",
    );
    const unlimitedUsers = t(
      "plan.highlights.unlimitedUsers",
      "Unlimited users",
    );
    const advancedIntegrations = t(
      "plan.highlights.advancedIntegrations",
      "Advanced integrations",
    );
    const ssoOAuth = t("plan.highlights.ssoOAuth", "SSO (OAuth2/OIDC)");
    const editingTextInPdfsCaps = t(
      "plan.highlights.editingTextInPdfsCaps",
      "Editing text in PDFs",
    );
    const enterpriseFeatures = t(
      "plan.highlights.enterpriseFeatures",
      "Enterprise features (SAML, Auditing)",
    );
    const usageTrackingPrometheus = t(
      "plan.highlights.usageTrackingPrometheus",
      "Usage tracking & Prometheus",
    );
    const customPdfMetadata = t(
      "plan.highlights.customPdfMetadata",
      "Custom PDF metadata",
    );
    const saveWithAnnualBilling = t(
      "plan.highlights.saveWithAnnualBilling",
      "Save with annual billing",
    );

    return {
      FREE: [
        t("plan.highlights.upToFiveUsers", "Up to 5 users"),
        t("plan.highlights.selfHosted", "Self-hosted"),
        t("plan.highlights.allBasicFeatures", "All basic features"),
      ],
      SERVER_MONTHLY: [
        selfHostedOnInfrastructure,
        unlimitedUsers,
        advancedIntegrations,
        ssoOAuth,
        editingTextInPdfsCaps,
        t("plan.highlights.cancelAnytime", "Cancel anytime"),
      ],
      SERVER_YEARLY: [
        selfHostedOnInfrastructure,
        unlimitedUsers,
        advancedIntegrations,
        ssoOAuth,
        editingTextInPdfsCaps,
        saveWithAnnualBilling,
      ],
      ENTERPRISE_MONTHLY: [
        enterpriseFeatures,
        usageTrackingPrometheus,
        customPdfMetadata,
        t("plan.highlights.perSeatLicensing", "Per-seat licensing"),
      ],
      ENTERPRISE_YEARLY: [
        enterpriseFeatures,
        usageTrackingPrometheus,
        customPdfMetadata,
        saveWithAnnualBilling,
      ],
    };
  }, [t]);
};
