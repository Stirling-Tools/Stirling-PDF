import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Group, Paper, Stack, Text } from "@mantine/core";
import apiClient from "@editor/services/apiClient";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { alert } from "@editor/components/toast";
import { serverErrorReason } from "@editor/services/errorUtils";
import { useSignatureLogo } from "@editor/hooks/tools/certSign/useSignatureLogo";
import { forgetSignatureLogo } from "@editor/services/signatureLogoService";

const ADMIN_LOGO_URL = "/api/v1/admin/signature-logo";

interface SignatureLogoCardProps {
  loginEnabled: boolean;
}

/** The company logo drawn on visible certificate signatures. Saves on upload, not with the page. */
export function SignatureLogoCard({ loginEnabled }: SignatureLogoCardProps) {
  const { t } = useTranslation();
  const logo = useSignatureLogo();
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await action();
      forgetSignatureLogo();
      alert({ alertType: "success", title: done });
    } catch (error) {
      alert({
        alertType: "error",
        title: t(
          "admin.settings.features.signatureLogo.failed",
          "Could not update the signature logo",
        ),
        body: await serverErrorReason(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const upload = (file: File | null) => {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    void run(
      () => apiClient.post(ADMIN_LOGO_URL, form, { suppressErrorToast: true }),
      t("admin.settings.features.signatureLogo.saved", "Signature logo saved"),
    );
  };

  const remove = () =>
    void run(
      () => apiClient.delete(ADMIN_LOGO_URL, { suppressErrorToast: true }),
      t(
        "admin.settings.features.signatureLogo.resetDone",
        "Back to the Stirling PDF logo",
      ),
    );

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <div>
          <Text fw={500} size="sm">
            {t("admin.settings.features.signatureLogo.label", "Signature logo")}
          </Text>
          <Text size="xs" c="dimmed">
            {t(
              "admin.settings.features.signatureLogo.description",
              "Drawn faded behind visible certificate signatures. The Stirling PDF logo is used until you upload your organisation's. PNG or JPEG, up to 2 MB.",
            )}
          </Text>
        </div>
        {logo && (
          <Group gap="sm">
            <img
              src={logo.image.src}
              alt={t(
                "admin.settings.features.signatureLogo.current",
                "Current signature logo",
              )}
              style={{
                maxHeight: 64,
                maxWidth: 240,
                objectFit: "contain",
                background: "white",
                padding: 6,
                borderRadius: 4,
              }}
            />
            <Text size="xs" c="dimmed">
              {logo.custom
                ? t(
                    "admin.settings.features.signatureLogo.customInUse",
                    "Your organisation's logo",
                  )
                : t(
                    "admin.settings.features.signatureLogo.defaultInUse",
                    "Stirling PDF logo (default)",
                  )}
            </Text>
          </Group>
        )}
        <Group gap="sm">
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg"
            hidden
            onChange={(event) => {
              upload(event.currentTarget.files?.[0] ?? null);
              event.currentTarget.value = "";
            }}
          />
          <Button
            variant="secondary"
            onClick={() => fileInput.current?.click()}
            loading={busy}
            disabled={!loginEnabled || busy}
            leftSection={<Icon name="upload" size="1rem" />}
          >
            {t("admin.settings.features.signatureLogo.upload", "Upload logo")}
          </Button>
          {logo?.custom && (
            <Button
              variant="secondary"
              onClick={remove}
              disabled={!loginEnabled || busy}
              leftSection={<Icon name="rotate-ccw" size="1rem" />}
            >
              {t(
                "admin.settings.features.signatureLogo.reset",
                "Use the Stirling PDF logo",
              )}
            </Button>
          )}
        </Group>
      </Stack>
    </Paper>
  );
}
