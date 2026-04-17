import React from "react";
import { useTranslation } from "react-i18next";
import { SlideConfig } from "@app/types/types";
import { UNIFIED_CIRCLE_CONFIG } from "@app/components/onboarding/slides/unifiedBackgroundConfig";
import { TrialStatus } from "@app/auth/UseSession";

interface FreeTrialSlideProps {
  trialStatus: TrialStatus;
}

function FreeTrialSlideTitle() {
  const { t } = useTranslation();

  return (
    <span>{t("onboarding.freeTrial.title", "Your 30-Day Pro Trial")}</span>
  );
}

const FreeTrialSlideBody = ({ trialStatus }: { trialStatus: TrialStatus }) => {
  const { t } = useTranslation();

  // Format the trial end date
  const trialEndDate = new Date(trialStatus.trialEnd).toLocaleDateString(
    undefined,
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  );

  // Determine which message to show based on payment method
  const afterTrialMessage = trialStatus.hasScheduledSub
    ? t(
        "onboarding.freeTrial.afterTrialWithPayment",
        "Your Pro subscription will start automatically when the trial ends.",
      )
    : trialStatus.hasPaymentMethod
      ? t(
          "onboarding.freeTrial.afterTrialWithPayment",
          "Your Pro subscription will start automatically when the trial ends.",
        )
      : t(
          "onboarding.freeTrial.afterTrialWithoutPayment",
          "After your trial ends, you'll continue with our free tier. Add a payment method to keep Pro access.",
        );

  // Pluralize days remaining
  const daysText =
    trialStatus.daysRemaining === 1
      ? t(
          "onboarding.freeTrial.daysRemainingSingular",
          "{{days}} day remaining",
          { days: trialStatus.daysRemaining },
        )
      : t("onboarding.freeTrial.daysRemaining", "{{days}} days remaining", {
          days: trialStatus.daysRemaining,
        });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <p>
        {t(
          "onboarding.freeTrial.body",
          "You have full access to Stirling PDF Pro features during your trial. Enjoy unlimited conversions, larger file sizes, and priority processing.",
        )}
      </p>
      <div
        style={{
          background: "rgba(255, 255, 255, 0.1)",
          borderRadius: "8px",
          padding: "1rem",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: "1.25rem",
            fontWeight: "bold",
            marginBottom: "0.5rem",
          }}
        >
          {daysText}
        </div>
        <div style={{ fontSize: "0.9rem", opacity: 0.9 }}>
          {t("onboarding.freeTrial.trialEnds", "Trial ends {{date}}", {
            date: trialEndDate,
          })}
        </div>
      </div>
      <p style={{ fontSize: "0.9rem", opacity: 0.9 }}>{afterTrialMessage}</p>
    </div>
  );
};

export default function FreeTrialSlide({
  trialStatus,
}: FreeTrialSlideProps): SlideConfig {
  return {
    key: "free-trial",
    title: <FreeTrialSlideTitle />,
    body: <FreeTrialSlideBody trialStatus={trialStatus} />,
    background: {
      gradientStops: ["#10B981", "#06B6D4"],
      circles: UNIFIED_CIRCLE_CONFIG,
    },
  };
}
