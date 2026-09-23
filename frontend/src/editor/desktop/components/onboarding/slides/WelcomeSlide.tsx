/** Desktop's opening slide, shadowing core's web one. Mirrors the SaaS
 *  {@code FreeEditorSlide} minus Policies, which the Processor owns and desktop lacks. */

import { Trans } from "react-i18next";
import { SlideConfig } from "@app/types/types";
import { UNIFIED_LIGHT_BACKGROUND } from "@app/components/onboarding/slides/unifiedBackgroundConfig";
import styles from "@app/components/onboarding/slides/WelcomeSlide.module.css";

const WelcomeSlideTitle = () => (
  <Trans
    i18nKey="onboarding.desktopWelcome.title"
    components={{ product: <span className={styles.productWord} /> }}
    defaults="Welcome to Stirling <product>Desktop</product>"
  />
);

const WelcomeSlideBody = () => (
  <span>
    <span className={styles.lead}>
      <Trans
        i18nKey="onboarding.desktopWelcome.body"
        components={{ strong: <strong /> }}
        defaults="There's a whole host of new changes to explore, including <strong>Agent Chat</strong>, automatic document <strong>classification</strong>, and more."
      />
    </span>
    <span className={styles.line}>
      <Trans
        i18nKey="onboarding.desktopWelcome.freeLine"
        components={{ free: <strong className={styles.highlight} /> }}
        defaults="The editor is now <free>completely free</free>."
      />
    </span>
  </span>
);

export default function WelcomeSlide(): SlideConfig {
  return {
    key: "welcome",
    title: <WelcomeSlideTitle />,
    body: <WelcomeSlideBody />,
    // Unread by the shared slide shell, which draws its own hero panel; the shared
    // default satisfies SlideConfig without this file naming a colour.
    background: UNIFIED_LIGHT_BACKGROUND,
  };
}
