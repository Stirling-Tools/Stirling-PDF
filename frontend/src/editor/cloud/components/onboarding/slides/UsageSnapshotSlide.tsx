import React from "react";
import { useTranslation } from "react-i18next";
import { SlideConfig } from "@app/types/types";
import { createLightSlideBackground } from "@app/components/onboarding/slides/unifiedBackgroundConfig";
import {
  FreeMeterPanel,
  useFreeSnapshot,
} from "@app/components/shared/config/configSections/usageMeters";
import i18n from "@app/i18n";
import styles from "@app/components/onboarding/slides/SaasOnboardingSlides.module.css";

const USAGE_BACKGROUND = createLightSlideBackground([249, 115, 22], "#FFEDD5");

const UsageSnapshotBody = () => {
  const { t } = useTranslation();
  const snap = useFreeSnapshot();

  return (
    <span>
      {t(
        "onboarding.saas.usage.body",
        "Automations, AI and API requests draw from your free allowance. Manual editing never counts against it.",
      )}
      {/* .payg provides the CSS variables the meter styles are scoped to */}
      <span
        className={`payg ${styles.usageMeterWrap}`}
        style={{ display: "block" }}
      >
        <FreeMeterPanel snap={snap} />
      </span>
    </span>
  );
};

export default function UsageSnapshotSlide(): SlideConfig {
  return {
    key: "usage-snapshot",
    title: i18n.t(
      "onboarding.saas.usage.title",
      "Your free Processor allowance",
    ),
    body: <UsageSnapshotBody />,
    background: USAGE_BACKGROUND,
  };
}
