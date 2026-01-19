import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Alert, Box, Button, Group, Loader, Stack, Text, TextInput } from "@mantine/core";
import { QRCodeSVG } from "qrcode.react";
import { SlideConfig } from "@app/types/types";
import { UNIFIED_CIRCLE_CONFIG } from "@app/components/onboarding/slides/unifiedBackgroundConfig";
import { accountService } from "@app/services/accountService";
import { useAccountLogout } from '@app/extensions/accountLogout';
import { useAuth } from "@app/auth/UseSession";
import LocalIcon from "@app/components/shared/LocalIcon";
import { BASE_PATH } from "@app/constants/app";
import styles from "@app/components/onboarding/InitialOnboardingModal/InitialOnboardingModal.module.css";
import { MfaSetupResponse } from "@app/responses/Mfa/MfaResponse";

interface MFASetupSlideProps {
  onMfaSetupComplete?: () => void;
}

function MFASetupContent({ onMfaSetupComplete }: MFASetupSlideProps) {
  const [mfaSetupData, setMfaSetupData] = useState<MfaSetupResponse | null>(null);
  const [mfaSetupCode, setMfaSetupCode] = useState("");
  const [mfaError, setMfaError] = useState("");
  const [mfaLoading, setMfaLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const setupCompleteRef = useRef(false);
  const { signOut } = useAuth();
  const accountLogout = useAccountLogout();
  const qrLogoSrc = `${BASE_PATH}/modern-logo/StirlingPDFLogoNoTextDark.svg`;

  const normalizeMfaCode = useCallback((value: string) => value.replace(/\D/g, "").slice(0, 6), []);

  const fetchMfaSetup = useCallback(async () => {
    try {
      setMfaLoading(true);
      setMfaError("");
      setMfaSetupCode("");
      const data = await accountService.requestMfaSetup();
      setMfaSetupData(data);
    } catch (err) {
      const axiosError = err as { response?: { data?: { error?: string } } };
      setMfaError(axiosError.response?.data?.error || "Unable to start two-factor setup. Please try again.");
    } finally {
      setMfaLoading(false);
    }
  }, []);

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
    window.location.assign('/login');
  }, []);

  const onLogout = useCallback(async() => {
    await accountLogout({ signOut, redirectToLogin });
  }, [accountLogout, redirectToLogin, signOut]);

  const handleEnableMfa = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();

      if (!mfaSetupCode.trim()) {
        setMfaError("Enter the authentication code to continue.");
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
          axiosError.response?.data?.error || "Unable to enable two-factor authentication. Check the code and try again."
        );
      } finally {
        setSubmitting(false);
      }
    },
    [mfaSetupCode, onMfaSetupComplete]
  );

  const isReady = Boolean(mfaSetupData);
  const mfaSetupContent = mfaSetupData ? (
    <div className={styles.mfaSetupGrid}>
      <Box className={styles.mfaQrCard}>
        <QRCodeSVG
          value={mfaSetupData.otpauthUri}
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
          Step-by-step
        </Text>
        <ol className={styles.mfaSteps}>
          <li>Open Google Authenticator, Authy, or 1Password.</li>
          <li>Scan the QR code or enter the setup key below.</li>
          <li>Enter the 6-digit code from your app.</li>
        </ol>
        <Text size="xs" c="dimmed">
          Setup key (manual entry)
        </Text>
        <TextInput
          value={mfaSetupData.secret}
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
            Secure your account by linking an authenticator app. Scan the QR code or enter the setup key, then confirm the
            6-digit code to finish.
          </Text>

          {mfaError && (
            <Alert icon={<LocalIcon icon="error" width={16} height={16} />} color="red" variant="light">
              {mfaError}
            </Alert>
          )}

          {mfaLoading && !isReady && (
            <Group gap="sm">
              <Loader size="sm" />
              <Text size="sm">Generating your QR code…</Text>
            </Group>
          )}

          {isReady && mfaSetupContent}

          <form onSubmit={handleEnableMfa} className={styles.mfaForm}>
            <Stack gap="sm">
              <TextInput
                id="mfa-setup-code"
                label="Authentication code"
                placeholder="123456"
                value={mfaSetupCode}
                onChange={(event) => setMfaSetupCode(normalizeMfaCode(event.currentTarget.value))}
                inputMode="numeric"
                maxLength={6}
                minLength={6}
                disabled={!isReady || submitting || setupComplete}
              />

              <Group justify="space-between" wrap="wrap">
                <Button
                  type="button"
                  variant="light"
                  onClick={fetchMfaSetup}
                  disabled={mfaLoading || submitting || setupComplete}
                >
                  Regenerate QR code
                </Button>
                <Button
                  type="submit"
                  loading={submitting}
                  disabled={!isReady || setupComplete || mfaSetupCode.length < 6}
                >
                  Enable MFA
                </Button>
                <Button
                  type="button"
                  variant="light"
                  onClick={onLogout}
                >
                  Logout
                </Button>
              </Group>

              {setupComplete && (
                <Alert color="green" variant="light">
                  MFA has been enabled. You can now continue.
                </Alert>
              )}
            </Stack>
          </form>
        </Stack>
      </div>
    </div>
  );
}

export default function MFASetupSlide({ onMfaSetupComplete }: MFASetupSlideProps = {}): SlideConfig {
  return {
    key: "mfa-setup-slide",
    title: "Multi-Factor Authentication Setup",
    body: <MFASetupContent onMfaSetupComplete={onMfaSetupComplete} />,
    background: {
      gradientStops: ["#059669", "#0891B2"], // Green to teal - security/trust colors
      circles: UNIFIED_CIRCLE_CONFIG,
    },
  };
}
