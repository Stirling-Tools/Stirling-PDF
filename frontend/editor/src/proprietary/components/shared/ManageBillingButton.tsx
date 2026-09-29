import React, { useState } from "react";
import { Button } from "@app/ui/Button";
import { useTranslation } from "react-i18next";
import licenseService from "@app/services/licenseService";
import { useLicense } from "@app/contexts/LicenseContext";
import { isSupabaseConfigured, supabase } from "@app/services/supabaseClient";
import { alert } from "@app/components/toast";

interface ManageBillingButtonProps {
  returnUrl?: string;
}

export const ManageBillingButton: React.FC<ManageBillingButtonProps> = ({
  returnUrl = window.location.href,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const { licenseInfo } = useLicense();
  const licenseKey = licenseInfo?.licenseKey?.trim();
  if (
    !isSupabaseConfigured ||
    !supabase ||
    !licenseInfo?.enabled ||
    !licenseKey ||
    licenseKey.startsWith("file:") ||
    licenseKey === "00000000-0000-0000-0000-000000000000"
  )
    return null;

  const handleClick = async () => {
    try {
      setLoading(true);

      const response = await licenseService.createBillingPortalSession(
        returnUrl,
        licenseKey,
      );

      // Open billing portal in new tab
      window.open(response.url, "_blank");
      setLoading(false);
    } catch (error: unknown) {
      console.error("Failed to open billing portal:", error);
      alert({
        alertType: "error",
        title: t("billing.portal.error", "Failed to open billing portal"),
        body:
          (error instanceof Error ? error.message : undefined) ||
          "Please try again or contact support.",
      });
      setLoading(false);
    }
  };

  return (
    <Button variant="secondary" onClick={handleClick} loading={loading}>
      {t("billing.manageBilling", "Manage Billing")}
    </Button>
  );
};
