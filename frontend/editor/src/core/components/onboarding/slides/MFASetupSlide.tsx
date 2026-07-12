import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Alert,
  Box,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { Button } from "@app/ui/Button";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { SlideConfig } from "@app/types/types";
import { UNIFIED_CIRCLE_CONFIG } from "@app/components/onboarding/slides/unifiedBackgroundConfig";
import { accountService } from "@app/services/accountService";
import { useAccountLogout } from "@app/extensions/accountLogout";
import { useAuth } from "@app/auth/UseSession";
import LocalIcon from "@app/components/shared/LocalIcon";
import { BASE_PATH, withBasePath } from "@app/constants/app";
import styles from "@app/components/onboarding/InitialOnboardingModal/InitialOnboardingModal.module.css";
import { MfaSetupResponse } from "@app/responses/Mfa/MfaResponse";
import i18n from "@app/i18n";

interface MFASetupSlideProps {
  onMfaSetupComplete?: () => void;
}

function MFASetupContent({ onMfaSetupComplete }: MFASetupSlideProps) {
  const { t } = useTranslation();
  const [mfaSetupData, setMfaSetupData] = useState<MfaSetupResponse | null>(
    null,
  );
  const [mfaSetupCode, setMfaSetupCode] = useState("");
  const [mfaError, setMfaError] = useState("");
  const [mfaLoading, setMfaLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const setupCompleteRef = useRef(false);
  const { signOut } = useAuth();
  const accountLogout = useAccountLogout();
  const qrLogoSrc = `${BASE_PATH}/modern-logo/StirlingPDFLogoNoTextDark.svg`;

  const normalizeMfaCode = useCallback(
    (value: string) => value.replace(/\D/g, "").slice(0, 6),
    [],
  );

  const fetchMfaSetup = useCallback(async () => {
    try {
      setMfaLoading(true);
      setMfaError("");
      setMfaSetupCode("");
      const data = await accountService.requestMfaSetup();
      setMfaSetupData(data);
    } catch (err) {
      const axiosError = err as { response?: { data?: { error?: string } } };
      setMfaError(
        axiosError.response?.data?.error ||
          t(
            "onboarding.mfa.setupError",
            "Unable to start two-factor setup. Please try again.",
          ),
      );
    } finally {
      setMfaLoading(false);
    }
  }, [t]);

  useEffect(() => {
    setupCompleteRef.current = setupComplete;
  }, [setupComplete]);

  useEffect(() => {
    void fetchMfaSetup();

    return () => {
      if (!setupCompleteRef.current) {
        void accountService.cancelMfaSetup();
      }
    };
  }, [fetchMfaSetup]);

  const redirectToLogin = useCallback(() => {
    window.location.assign(withBasePath("/login"));
  }, []);

  const onLogout = useCallback(async () => {
    await accountLogout({ signOut, redirectToLogin });
  }, [accountLogout, redirectToLogin, signOut]);

  const handleEnableMfa = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();

      if (!mfaSetupCode.trim()) {
        setMfaError(
          t(
            "onboarding.mfa.enterCodeError",
            "Enter the authentication code to continue.",
          ),
        );
        return;
      }

      try {
        setSubmitting(true);
        setMfaError("");
        await accountService.enableMfa(mfaSetupCode.trim());
        setSetupComplete(true);
        onMfaSetupComplete?.();
      } catch (err) {
        const axiosError = err as { response?: { data?: { error?: string } } };
        setMfaError(
          axiosError.response?.data?.error ||
            t(
              "onboarding.mfa.enableError",
              "Unable to enable two-factor authentication. Check the code and try again.",
            ),
        );
      } finally {
        setSubmitting(false);
      }
    },
    [mfaSetupCode, onMfaSetupComplete, t],
  );

  const isReady = Boolean(mfaSetupData);
  const mfaSetupContent = mfaSetupData ? (
    <div className={styles.mfaSetupGrid}>
      <Box className={styles.mfaQrCard}>
        <QRCodeSVG
          value={mfaSetupData.otpauthUri ?? ""}
          size={168}
          level="H"
          imageSettings={{
            src: qrLogoSrc,
            height: 36,
            width: 36,
            excavate: true,
          }}
        />
      </Box>

      <Stack gap="xs">
        <Text size="sm" fw={600}>
          {t("onboarding.mfa.stepByStep", "Step-by-step")}
        </Text>
        <ol className={styles.mfaSteps}>
          <li>
            {t(
              "onboarding.mfa.openAuthenticator",
              "Open Google Authenticator, Authy, or 1Password.",
            )}
          </li>
          <li>
            {t(
              "onboarding.mfa.scanQrCode",
              "Scan the QR code or enter the setup key below.",
            )}
          </li>
          <li>
            {t(
              "onboarding.mfa.enterCode",
              "Enter the 6-digit code from your app.",
            )}
          </li>
        </ol>
        <Text size="xs" c="dimmed">
          {t("onboarding.mfa.setupKey", "Setup key (manual entry)")}
        </Text>
        <TextInput
          value={mfaSetupData.secret ?? ""}
          readOnly
          variant="filled"
          styles={{ input: { fontFamily: "monospace" } }}
        />
      </Stack>
    </div>
  ) : null;

  return (
    <div className={styles.mfaSlideContent}>
      <div className={styles.mfaCard}>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {t(
              "onboarding.mfa.description",
              "Secure your account by linking an authenticator app. Scan the QR code or enter the setup key, then confirm the 6-digit code to finish.",
            )}
          </Text>

          {mfaError && (
            <Alert
              icon={<LocalIcon icon="error" width={16} height={16} />}
              color="red"
              variant="light"
            >
              {mfaError}
            </Alert>
          )}

          {mfaLoading && !isReady && (
            <Group gap="sm">
              <Loader size="sm" />
              <Text size="sm">
                {t("onboarding.mfa.qrCodeLoading", "Generating your QR code…")}
              </Text>
            </Group>
          )}

          {isReady && mfaSetupContent}

          <form onSubmit={handleEnableMfa} className={styles.mfaForm}>
            <Stack gap="sm">
              <TextInput
                id="mfa-setup-code"
                label={t(
                  "onboarding.mfa.authenticationCode",
                  "Authentication code",
                )}
                placeholder="123456"
                value={mfaSetupCode}
                onChange={(event) =>
                  setMfaSetupCode(normalizeMfaCode(event.currentTarget.value))
                }
                inputMode="numeric"
                maxLength={6}
                minLength={6}
                disabled={!isReady || submitting || setupComplete}
              />

              <Group justify="space-between" wrap="wrap">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={fetchMfaSetup}
                  disabled={mfaLoading || submitting || setupComplete}
                >
                  {t("onboarding.mfa.regenerateQrCode", "Regenerate QR code")}
                </Button>
                <Button
                  type="submit"
                  loading={submitting}
                  disabled={
                    !isReady || setupComplete || mfaSetupCode.length < 6
                  }
                >
                  {t("onboarding.mfa.enable", "Enable MFA")}
                </Button>
                <Button variant="secondary" type="button" onClick={onLogout}>
                  {t("onboarding.mfa.logout", "Logout")}
                </Button>
              </Group>

              {setupComplete && (
                <Alert color="green" variant="light">
                  {t(
                    "onboarding.mfa.success",
                    "MFA has been enabled. You can now continue.",
                  )}
                </Alert>
              )}
            </Stack>
          </form>
        </Stack>
      </div>
    </div>
  );
}

export default function MFASetupSlide({
  onMfaSetupComplete,
}: MFASetupSlideProps = {}): SlideConfig {
  return {
    key: "mfa-setup-slide",
    title: i18n.t(
      "onboarding.mfa.title",
      "Multi-Factor Authentication Setup",
    ),
    body: <MFASetupContent onMfaSetupComplete={onMfaSetupComplete} />,
    background: {
      gradientStops: ["#059669", "#0891B2"], // Green to teal - security/trust colors
      circles: UNIFIED_CIRCLE_CONFIG,
    },
  };
}
