import React from "react";
import { Trans } from "react-i18next";
import i18n from "@editor/i18n";
import { SlideConfig } from "@editor/types/types";
import { UNIFIED_CIRCLE_CONFIG } from "@editor/components/onboarding/slides/unifiedBackgroundConfig";
import styles from "@editor/components/onboarding/InitialOnboardingModal/InitialOnboardingModal.module.css";

export default function TourOverviewSlide(): SlideConfig {
  return {
    key: "tour-overview",
    title: i18n.t("onboarding.tourOverview.title", "Tour Overview"),
    body: (
      <span className={styles.bodyCopyInner}>
        <Trans
          i18nKey="onboarding.tourOverview.body"
          defaults="Stirling PDF V2 ships with dozens of tools and a refreshed layout. Take a quick tour to see what changed and where to find the features you need."
          components={{ strong: <strong /> }}
        />
      </span>
    ),
    background: {
      gradientStops: ["#2563EB", "#7C3AED"],
      circles: UNIFIED_CIRCLE_CONFIG,
    },
  };
}
