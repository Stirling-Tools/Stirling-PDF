import React from "react";
import { Trans } from "react-i18next";
import { SlideConfig } from "@app/types/types";
import { createLightSlideBackground } from "@app/components/onboarding/slides/unifiedBackgroundConfig";
import styles from "@app/components/onboarding/slides/SaasOnboardingSlides.module.css";

// Stirling logo red (sampled from modern-logo/logo512.png)
const FREE_EDITOR_BACKGROUND = createLightSlideBackground(
  [142, 49, 49],
  "#F8E0E0",
);

const FreeEditorBody = () => (
  <span>
    <Trans
      i18nKey="onboarding.saas.freeEditor.premium"
      components={{ strong: <strong /> }}
      defaults="We've added loads of new features, including <strong>Policies</strong> and <strong>Agent Chat</strong>."
    />
    <span className={styles.freeLine}>
      <Trans
        i18nKey="onboarding.saas.freeEditor.freeLine"
        components={{ free: <strong className={styles.freeHighlight} /> }}
        defaults="The editor is now <free>completely free</free>."
      />
    </span>
  </span>
);

export default function FreeEditorSlide(): SlideConfig {
  const title = (
    <Trans
      i18nKey="onboarding.saas.freeEditor.title"
      defaults="Welcome to Stirling"
    />
  );

  return {
    key: "free-editor",
    title,
    body: <FreeEditorBody />,
    background: FREE_EDITOR_BACKGROUND,
  };
}
