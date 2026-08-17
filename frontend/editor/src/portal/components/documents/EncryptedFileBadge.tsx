import { useTranslation } from "react-i18next";
import LockRounded from "@mui/icons-material/LockRounded";
import { StatusBadge } from "@app/ui";

export interface EncryptedFileBadgeProps {
  /** `StoredFile.encryptionKeyId`. Null means the file is stored as plaintext. */
  encryptionKeyId: string | null;
}

/**
 * Marks a stored file as encrypted at rest. Carries a text label rather than
 * relying on the padlock alone, so it is not colour or icon only.
 *
 * Renders nothing for a plaintext file, so a deployment that never enabled the
 * feature shows no marker anywhere without the caller having to know that: the
 * key id is the only input, which is what a file list actually has.
 */
export function EncryptedFileBadge({
  encryptionKeyId,
}: EncryptedFileBadgeProps) {
  const { t } = useTranslation();
  if (!encryptionKeyId) return null;

  return (
    <StatusBadge tone="success" size="sm" showDot={false}>
      <span className="portal-enc__badge-row">
        <LockRounded style={{ fontSize: "0.85rem" }} aria-hidden />
        {t("portal.documents.encryptedAtRest")}
      </span>
    </StatusBadge>
  );
}
