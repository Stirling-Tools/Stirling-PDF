import { useRef, useState } from "react";
import { Alert, Group, Paper, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Avatar } from "@app/ui/Avatar";
import { Button } from "@app/ui/Button";
import { FilePicker } from "@app/ui/FilePicker";
import { ProfilePictureCropper } from "@app/components/shared/config/ProfilePictureCropper";
import LocalIcon from "@app/components/shared/LocalIcon";
import {
  MAX_PROFILE_PICTURE_BYTES,
  PROFILE_PICTURE_ACCEPT,
  removeProfilePicture,
  uploadProfilePicture,
} from "@app/services/profilePictureService";
import {
  refreshOwnProfilePicture,
  useProfilePictureUrl,
} from "@app/hooks/useProfilePictureUrl";

interface ProfilePictureCardProps {
  /** Name the initials fall back to when there is no picture. */
  displayName: string;
}

function errorMessageOf(err: unknown, fallback: string): string {
  const response = (err as { response?: { data?: { message?: string } } })
    ?.response;
  return response?.data?.message || fallback;
}

/**
 * Upload / remove the signed-in user's avatar. The image is cropped to a square client-side, then
 * re-encoded server-side, so what lands in the database is always a small PNG.
 */
export default function ProfilePictureCard({
  displayName,
}: ProfilePictureCardProps) {
  const { t } = useTranslation();
  const pictureUrl = useProfilePictureUrl();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropperFile, setCropperFile] = useState<File | null>(null);
  // Mantine keeps the picked file on the hidden input, so re-picking the same one after Cancel
  // fires no change event. Reset first, before any guard can return early.
  const resetPicker = useRef<() => void>(null);

  const handleFilePicked = (file: File | null) => {
    resetPicker.current?.();
    if (!file) return;
    if (file.size > MAX_PROFILE_PICTURE_BYTES) {
      setError(
        t(
          "account.profilePicture.sizeError",
          "Please choose an image smaller than {{megabytes}}MB.",
          {
            megabytes: Math.round(MAX_PROFILE_PICTURE_BYTES / (1024 * 1024)),
          },
        ),
      );
      return;
    }
    setError(null);
    setCropperFile(file);
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    setBusy(true);
    setError(null);
    try {
      await uploadProfilePicture(croppedBlob);
      await refreshOwnProfilePicture();
    } catch (err) {
      setError(
        errorMessageOf(
          err,
          t(
            "account.profilePicture.uploadError",
            "Could not upload your profile picture. Please try again.",
          ),
        ),
      );
    } finally {
      setBusy(false);
      setCropperFile(null);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    setError(null);
    try {
      await removeProfilePicture();
      await refreshOwnProfilePicture();
    } catch (err) {
      setError(
        errorMessageOf(
          err,
          t(
            "account.profilePicture.removeError",
            "Could not remove your profile picture. Please try again.",
          ),
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <Text fw={600}>
          {t("account.profilePicture.title", "Profile picture")}
        </Text>
        <Text size="sm" c="dimmed">
          {t(
            "account.profilePicture.description",
            "Add a picture so teammates recognise you across Stirling PDF.",
          )}
        </Text>

        {error && (
          <Alert
            icon={<LocalIcon icon="error-rounded" width="1rem" height="1rem" />}
            color="red"
            variant="light"
          >
            {error}
          </Alert>
        )}

        <Group align="center" gap="md">
          <Avatar
            src={pictureUrl ?? undefined}
            name={displayName}
            size="lg"
            ariaLabel={t(
              "account.profilePicture.current",
              "Your profile picture",
            )}
          />
          <Stack gap={6}>
            <Group gap="sm">
              <FilePicker
                onChange={handleFilePicked}
                resetRef={resetPicker}
                accept={PROFILE_PICTURE_ACCEPT}
                disabled={busy}
                loading={busy}
              >
                {pictureUrl
                  ? t("account.profilePicture.change", "Change picture")
                  : t("account.profilePicture.upload", "Upload picture")}
              </FilePicker>
              <Button
                variant="secondary"
                onClick={handleRemove}
                disabled={busy || !pictureUrl}
              >
                {t("account.profilePicture.remove", "Remove")}
              </Button>
            </Group>
            <Text size="xs" c="dimmed">
              {t(
                "account.profilePicture.help",
                "PNG, JPG or WebP, up to {{megabytes}}MB. Images are cropped to a square and resized.",
                {
                  megabytes: Math.round(
                    MAX_PROFILE_PICTURE_BYTES / (1024 * 1024),
                  ),
                },
              )}
            </Text>
            <Text size="xs" c="dimmed">
              {t(
                "account.profilePicture.visibility",
                "Visible to you, your administrators, and people on your teams.",
              )}
            </Text>
          </Stack>
        </Group>
      </Stack>

      <ProfilePictureCropper
        file={cropperFile}
        opened={cropperFile !== null}
        onClose={() => setCropperFile(null)}
        onCropComplete={handleCropComplete}
      />
    </Paper>
  );
}
