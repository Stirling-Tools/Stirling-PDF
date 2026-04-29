import { Modal, Stack, Button } from "@mantine/core";
import { useTranslation } from "react-i18next";
import DiamondOutlinedIcon from "@mui/icons-material/DiamondOutlined";
import AnimatedSlideBackground from "@app/components/onboarding/slides/AnimatedSlideBackground";
import styles from "@app/components/onboarding/InitialOnboardingModal/InitialOnboardingModal.module.css";
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from "@app/styles/zIndex";

interface TrialExpiredModalProps {
  opened: boolean;
  onClose: () => void;
  onSubscribe: () => void;
}

export function TrialExpiredModal({
  opened,
  onClose,
  onSubscribe,
}: TrialExpiredModalProps) {
  const { t } = useTranslation();

  // Use CSS variables for theme colors
  const amberColor =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--color-amber-500")
      .trim() || "#f59e0b";
  const redColor =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--color-red-500")
      .trim() || "#ef4444";
  const gradientStops: [string, string] = [amberColor, redColor];

  const circles = [
    {
      position: "bottom-left" as const,
      size: 270, // 16.875rem
      color: "rgba(255, 255, 255, 0.25)",
      opacity: 0.9,
      amplitude: 24, // 1.5rem
      duration: 4.5,
      offsetX: 18, // 1.125rem
      offsetY: 14, // 0.875rem
    },
    {
      position: "top-right" as const,
      size: 300, // 18.75rem
      color: "rgba(255, 255, 255, 0.2)",
      opacity: 0.9,
      amplitude: 28, // 1.75rem
      duration: 4.5,
      delay: 0.5,
      offsetX: 24, // 1.5rem
      offsetY: 18, // 1.125rem
    },
  ];

  return (
    <Modal
      opened={opened}
      onClose={() => {}} // Prevent closing by clicking outside or ESC
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      centered
      size="lg"
      radius="lg"
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
        <div className={styles.heroWrapper} style={{ flexShrink: 0 }}>
          <AnimatedSlideBackground
            gradientStops={gradientStops}
            circles={circles}
            isActive
            slideKey="trial-expired"
          />
          <div className={styles.heroLogo}>
            <div className={styles.heroLogoCircle}>
              <DiamondOutlinedIcon sx={{ fontSize: 64, color: "#000000" }} />
            </div>
          </div>
        </div>

        <div
          className={styles.modalBody}
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <Stack gap={16}>
            <div className={`${styles.title} ${styles.titleText}`}>
              {t("plan.trial.expired", "Your Trial Has Ended")}
            </div>

            <div className={styles.bodyText}>
              <div className={`${styles.bodyCopy} ${styles.bodyCopyInner}`}>
                {t(
                  "plan.trial.expiredMessage",
                  "Your 30-day Pro trial has expired. Subscribe to Pro to continue accessing premium features, or continue with our free tier.",
                )}
              </div>
            </div>

            <div className={styles.bodyText}>
              <div className={`${styles.bodyCopy} ${styles.bodyCopyInner}`}>
                {t(
                  "plan.trial.freeTierLimitations",
                  "Free tier includes basic PDF tools with usage limits.",
                )}
              </div>
            </div>

            <div className={styles.buttonContainer}>
              <style>{`
                @media (max-width: 30rem) {
                  .trial-button-container {
                    justify-content: center !important;
                  }
                  .trial-modal-button {
                    flex: 1 1 100% !important;
                  }
                }
                .trial-modal-button-primary:hover {
                  background: linear-gradient(135deg, var(--color-amber-600), var(--color-red-600)) !important;
                }
              `}</style>
              <div
                className="trial-button-container"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                  justifyContent: "space-between",
                }}
              >
                <Button
                  onClick={onClose}
                  variant="default"
                  size="sm"
                  className="trial-modal-button"
                  style={{
                    fontSize: "0.8125rem",
                    padding: "0.5rem 1rem",
                    height: "auto",
                    minWidth: "8.125rem",
                    flex: "0 1 auto",
                    border: "0",
                  }}
                >
                  {t("plan.trial.continueWithFree", "Continue with Free")}
                </Button>

                <Button
                  onClick={onSubscribe}
                  size="md"
                  className="trial-modal-button trial-modal-button-primary"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--color-amber-500), var(--color-red-500))",
                    color: "#FFFFFF",
                    fontSize: "0.9375rem",
                    fontWeight: 600,
                    padding: "0.75rem 1.5rem",
                    height: "auto",
                    border: "none",
                    minWidth: "10.625rem",
                    flex: "0 1 auto",
                  }}
                >
                  {t("plan.trial.subscribeToPro", "Subscribe to Pro")}
                </Button>
              </div>
            </div>
          </Stack>
        </div>
      </Stack>
    </Modal>
  );
}
