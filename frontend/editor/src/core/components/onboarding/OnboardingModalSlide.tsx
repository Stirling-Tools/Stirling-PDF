/**
 * OnboardingModalSlide
 *
 * Editor-flow adapter over the shared {@link OnboardingSlideShell}: maps a
 * SLIDE_DEFINITIONS entry (hero + buttons) and its resolved content onto the
 * shell so the editor onboarding renders the same card as every other flow.
 */

import { useTranslation } from "react-i18next";
import DiamondOutlinedIcon from "@mui/icons-material/DiamondOutlined";

import type {
  SlideDefinition,
  ButtonAction,
  ButtonDefinition,
} from "@app/components/onboarding/onboardingFlowConfig";
import type { OnboardingRuntimeState } from "@app/components/onboarding/orchestrator/onboardingConfig";
import type { SlideConfig } from "@app/types/types";
import OnboardingSlideShell, {
  ShellHero,
  type ShellButton,
} from "@app/components/onboarding/OnboardingSlideShell";
import LocalIcon from "@app/components/shared/LocalIcon";

interface OnboardingModalSlideProps {
  slideDefinition: SlideDefinition;
  slideContent: SlideConfig;
  runtimeState: OnboardingRuntimeState;
  modalSlideCount: number;
  currentModalSlideIndex: number;
  onSkip: () => void;
  onAction: (action: ButtonAction) => void;
  allowDismiss?: boolean;
}

const HERO_ICON: Record<string, string> = {
  rocket: "rocket-launch",
  shield: "verified-user-outline",
  lock: "lock-outline",
  analytics: "analytics",
};

export default function OnboardingModalSlide({
  slideDefinition,
  slideContent,
  runtimeState,
  modalSlideCount,
  currentModalSlideIndex,
  onSkip,
  onAction,
  allowDismiss = true,
}: OnboardingModalSlideProps) {
  const { t } = useTranslation();
  const { licenseNotice } = runtimeState;
  const flowState = { selectedRole: runtimeState.selectedRole };

  const heroType = slideDefinition.hero.type;
  const hero =
    heroType === "dual-icon" || heroType === "logo" ? (
      <ShellHero appIcon />
    ) : (
      <ShellHero>
        {heroType === "diamond" ? (
          <DiamondOutlinedIcon sx={{ fontSize: 30 }} />
        ) : HERO_ICON[heroType] ? (
          <LocalIcon icon={HERO_ICON[heroType]} width={30} height={30} />
        ) : null}
      </ShellHero>
    );

  const resolveLabel = (button: ButtonDefinition) => {
    if (
      button.type === "button" &&
      slideDefinition.id === "server-license" &&
      button.action === "see-plans" &&
      licenseNotice.isOverLimit
    ) {
      return t("onboarding.serverLicense.upgrade", "Upgrade now →");
    }
    const label = button.label ?? "";
    if (!label) return "";
    const fallback = label.split(".").pop() || label;
    return t(label, fallback);
  };

  const buttons: ShellButton[] = slideDefinition.buttons.map((button) => ({
    key: button.key,
    back: button.type === "icon",
    label: resolveLabel(button),
    primary: (button.variant ?? "secondary") === "primary",
    accent: button.accent,
    action: button.action,
    disabled: button.disabledWhen?.(flowState) ?? false,
  }));

  return (
    <OnboardingSlideShell
      hero={hero}
      slideKey={slideContent.key}
      title={slideContent.title}
      body={slideContent.body}
      stepIndex={currentModalSlideIndex}
      stepCount={modalSlideCount}
      buttons={buttons}
      onAction={(action) => onAction(action as ButtonAction)}
      onClose={onSkip}
      allowDismiss={allowDismiss}
    />
  );
}
