import { useState, useEffect, useMemo } from "react";
import { Modal, Stack, Group, Button, ActionIcon } from "@mantine/core";
import { useTranslation } from "react-i18next";
import CloseIcon from "@mui/icons-material/Close";
import LocalIcon from "@app/components/shared/LocalIcon";
import AnimatedSlideBackground from "@app/components/onboarding/slides/AnimatedSlideBackground";
import OnboardingStepper from "@app/components/onboarding/OnboardingStepper";
import { SetupWizard } from "@app/components/SetupWizard";
import WelcomeSlide from "@app/components/onboarding/slides/WelcomeSlide";
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from "@app/styles/zIndex";
import styles from "@app/components/onboarding/InitialOnboardingModal/InitialOnboardingModal.module.css";
import { connectionModeService } from "@app/services/connectionModeService";

const ONBOARDING_KEY = "stirling-desktop-onboarding-seen";

const SIGN_IN_GRADIENT: [string, string] = ["#3B82F6", "#7C3AED"];

/**
 * Desktop-specific onboarding modal.
 * Shown on first launch: welcome slide → sign-in slide.
 * Replaces the core onboarding (which targets server/admin users).
 */
export function DesktopOnboardingModal() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(
    () => !localStorage.getItem(ONBOARDING_KEY),
  );
  const [step, setStep] = useState(0);
  // null = still checking, true = locked (suppress modal), false = not locked (show modal)
  const [isLocked, setIsLocked] = useState<boolean | null>(null);

  // Provisioned (locked) deployments skip the onboarding entirely — the non-dismissible
  // SignInModal handles authentication and shows the correct self-hosted login flow.
  useEffect(() => {
    connectionModeService.getCurrentConfig().then((cfg) => {
      setIsLocked(cfg.lock_connection_mode && !!cfg.server_config?.url);
    });
  }, []);

  const dismissFinal = () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setVisible(false);
  };

  // X on slide 0 advances to sign-in slide rather than dismissing entirely
  const handleClose = () => {
    if (step === 0) {
      setStep(1);
    } else {
      dismissFinal();
    }
  };

  const handleComplete = () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setVisible(false);
    // No reload needed — AppProviders subscribes to connectionModeService and remounts
    // the SaaS provider tree when mode changes, avoiding the Windows WebView2 freeze
    // that window.location.reload() causes during a backgrounded OAuth flow.
  };

  // Call WelcomeSlide as a data factory (not a component render) — memoised so it
  // isn't reconstructed on every render while the modal is open.
  const welcomeSlide = useMemo(() => WelcomeSlide(), []);
  const totalSteps = 2;

  if (!visible || isLocked === null || isLocked) return null;

  return (
    <Modal
      opened={visible}
      onClose={handleClose}
      closeOnClickOutside={step === 1}
      centered
      size="lg"
      radius="lg"
      withCloseButton={false}
      zIndex={Z_INDEX_OVER_FULLSCREEN_SURFACE}
      styles={{
        body: { padding: 0 },
        content: {
          overflow: "hidden",
          border: "none",
          background: "var(--bg-surface)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <Stack
        gap={0}
        className={styles.modalContent}
        style={{
          height: "100%",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Hero section — gradient changes per slide */}
        <div className={styles.heroWrapper} style={{ flexShrink: 0 }}>
          <AnimatedSlideBackground
            gradientStops={
              step === 0
                ? welcomeSlide.background.gradientStops
                : SIGN_IN_GRADIENT
            }
            circles={welcomeSlide.background.circles}
            isActive
            slideKey={step === 0 ? "desktop-welcome" : "desktop-sign-in"}
          />
          <ActionIcon
            onClick={handleClose}
            radius="md"
            size={36}
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              backgroundColor: "rgba(255, 255, 255, 0.2)",
              color: "white",
              backdropFilter: "blur(4px)",
              zIndex: 10,
            }}
            styles={{
              root: {
                "&:hover": { backgroundColor: "rgba(255, 255, 255, 0.3)" },
              },
            }}
          >
            <CloseIcon fontSize="small" />
          </ActionIcon>
          <div className={styles.heroLogo} key={`logo-${step}`}>
            <div className={styles.heroLogoCircle}>
              {step === 0 ? (
                <LocalIcon
                  icon="rocket-launch"
                  width={64}
                  height={64}
                  className={styles.heroIcon}
                />
              ) : (
                <LocalIcon
                  icon="login"
                  width={64}
                  height={64}
                  className={styles.heroIcon}
                />
              )}
            </div>
          </div>
        </div>

        {/* Body section */}
        <div
          className={styles.modalBody}
          style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}
        >
          {step === 0 ? (
            // Welcome slide
            <Stack gap={16}>
              <div className={`${styles.title} ${styles.titleText}`}>
                {welcomeSlide.title}
              </div>
              <div className={styles.bodyText}>
                <div className={`${styles.bodyCopy} ${styles.bodyCopyInner}`}>
                  {welcomeSlide.body}
                </div>
                <style>{`.${styles.bodyCopyInner} strong { color: var(--onboarding-title); font-weight: 600; }`}</style>
              </div>
              <OnboardingStepper totalSteps={totalSteps} activeStep={step} />
              <div className={styles.buttonContainer}>
                <Group justify="flex-end">
                  <Button
                    onClick={() => setStep(1)}
                    styles={{
                      root: {
                        background: "var(--onboarding-primary-button-bg)",
                        color: "var(--onboarding-primary-button-text)",
                      },
                    }}
                  >
                    {t("onboarding.buttons.next", "Next →")}
                  </Button>
                </Group>
              </div>
            </Stack>
          ) : (
            // Sign-in slide
            <Stack gap={12}>
              <OnboardingStepper totalSteps={totalSteps} activeStep={step} />
              <SetupWizard
                noLayout
                onComplete={handleComplete}
                onClose={dismissFinal}
              />
            </Stack>
          )}
        </div>
      </Stack>
    </Modal>
  );
}
