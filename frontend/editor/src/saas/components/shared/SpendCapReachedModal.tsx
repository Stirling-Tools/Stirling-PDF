import { useMemo } from "react";
import { Modal, Stack, Button } from "@mantine/core";
import { useTranslation } from "react-i18next";
import TrendingUpIcon from "@mui/icons-material/TrendingUpOutlined";
import AnimatedSlideBackground from "@app/components/onboarding/slides/AnimatedSlideBackground";
import styles from "@app/components/onboarding/InitialOnboardingModal/InitialOnboardingModal.module.css";
import { Z_INDEX_OVER_FULLSCREEN_SURFACE } from "@app/styles/zIndex";
import { navigateToSettings } from "@app/utils/settingsNavigation";
import {
  SpendCapMeterPanel,
  spendCapSnapshotFromWallet,
} from "@app/components/shared/config/configSections/usageMeters";
import { useWallet } from "@app/hooks/useWallet";

interface SpendCapReachedModalProps {
  onClose: () => void;
}

function readColor(varName: string, fallback: string): string {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue(varName)
      .trim() || fallback
  );
}

export function SpendCapReachedModal({ onClose }: SpendCapReachedModalProps) {
  const { t } = useTranslation();
  const { wallet, loading } = useWallet();

  // Resolve theme colours once; reading the CSS vars on every render would
  // force a style recalc.
  const gradientStops = useMemo<[string, string]>(
    () => [
      readColor("--color-green-500", "#22c55e"),
      readColor("--color-green-700", "#15803d"),
    ],
    [],
  );

  // Hold the modal back until the wallet resolves so the meter never flashes
  // placeholder numbers before the real ones land.
  if (loading || !wallet) return null;
  const snap = spendCapSnapshotFromWallet(wallet);

  const circles = [
    {
      position: "bottom-left" as const,
      size: 270,
      color: "rgba(255, 255, 255, 0.25)",
      opacity: 0.9,
      amplitude: 24,
      duration: 4.5,
      offsetX: 18,
      offsetY: 14,
    },
    {
      position: "top-right" as const,
      size: 300,
      color: "rgba(255, 255, 255, 0.2)",
      opacity: 0.9,
      amplitude: 28,
      duration: 4.5,
      delay: 0.5,
      offsetX: 24,
      offsetY: 18,
    },
  ];

  const handleRaiseCap = () => {
    onClose();
    navigateToSettings("plan");
  };

  return (
    <Modal
      opened
      onClose={onClose}
      withCloseButton={false}
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
            slideKey="spend-cap-reached"
          />
          <div className={styles.heroLogo}>
            <div className={styles.heroLogoCircle}>
              <TrendingUpIcon sx={{ fontSize: 64, color: "#000000" }} />
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
              {t("plan.spendCap.title", "You're on a Roll!")}
            </div>

            <div className={styles.bodyText}>
              <div className={`${styles.bodyCopy} ${styles.bodyCopyInner}`}>
                {t(
                  "plan.spendCap.message",
                  "You've made the most of this month's cap. That's a load of automation, AI and API work! Bump it up whenever you like to keep going.",
                )}
              </div>
            </div>

            <SpendCapMeterPanel snap={snap} />

            <div className={styles.buttonContainer}>
              <style>{`
                @media (max-width: 30rem) {
                  .spend-cap-button-container {
                    justify-content: center !important;
                  }
                  .spend-cap-modal-button {
                    flex: 1 1 100% !important;
                  }
                }
                .spend-cap-modal-button-primary:hover {
                  background: linear-gradient(135deg, var(--color-green-600), var(--color-green-800)) !important;
                }
              `}</style>
              <div
                className="spend-cap-button-container"
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
                  className="spend-cap-modal-button"
                  style={{
                    fontSize: "0.8125rem",
                    padding: "0.5rem 1rem",
                    height: "auto",
                    minWidth: "8.125rem",
                    flex: "0 1 auto",
                    border: "0",
                  }}
                >
                  {t("plan.spendCap.dismiss", "Not Now")}
                </Button>

                <Button
                  onClick={handleRaiseCap}
                  size="md"
                  className="spend-cap-modal-button spend-cap-modal-button-primary"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--color-green-500), var(--color-green-700))",
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
                  {t("plan.spendCap.cta", "View Spending Limit")}
                </Button>
              </div>
            </div>
          </Stack>
        </div>
      </Stack>
    </Modal>
  );
}
