import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import GroupAddRoundedIcon from "@mui/icons-material/GroupAddRounded";
import { useTranslation } from "react-i18next";
import OnboardingSlideShell, {
  ShellHero,
  type ShellButton,
} from "@app/components/onboarding/OnboardingSlideShell";
import { useSaasOnboardingState } from "@app/components/onboarding/useSaasOnboardingState";
import {
  type SlideId,
  type ButtonAction,
  type ButtonDefinition,
} from "@app/components/onboarding/saasOnboardingFlowConfig";

interface SaasOnboardingModalProps {
  opened: boolean;
  onClose: () => void;
  /**
   * Drop the closing "desktop-install" slide. Set by the desktop app, which
   * reuses this flow but has no reason to pitch its own download. Defaults to
   * false (slide shown) so the web (saas) flow is unchanged.
   */
  hideDesktopInstall?: boolean;
  slideIds?: SlideId[];
}

export default function SaasOnboardingModal(props: SaasOnboardingModalProps) {
  const { t } = useTranslation();
  const flow = useSaasOnboardingState(props);

  if (!flow) {
    return null;
  }

  const {
    currentStep,
    totalSteps,
    currentSlide,
    slideDefinition,
    flowState,
    handleButtonAction,
  } = flow;

  const heroType = slideDefinition.hero.type;
  const hero =
    heroType === "dual-icon" || heroType === "logo" ? (
      <ShellHero appIcon />
    ) : (
      <ShellHero>
        {heroType === "bolt" && <BoltRoundedIcon sx={{ fontSize: 30 }} />}
        {heroType === "team" && <GroupAddRoundedIcon sx={{ fontSize: 30 }} />}
      </ShellHero>
    );

  const resolveLabel = (button: ButtonDefinition) => {
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
    action: button.action,
    disabled: button.disabledWhen?.(flowState) ?? false,
  }));

  return (
    <OnboardingSlideShell
      opened={props.opened}
      hero={hero}
      slideKey={currentSlide.key}
      title={currentSlide.title}
      body={currentSlide.body}
      stepIndex={currentStep}
      stepCount={totalSteps}
      buttons={buttons}
      onAction={(action) => handleButtonAction(action as ButtonAction)}
      onClose={props.onClose}
    />
  );
}
