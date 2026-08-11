import { useTranslation } from "react-i18next";
import LockRounded from "@mui/icons-material/LockRounded";
import { StatusBadge } from "@app/ui";

export interface EncryptedFileBadgeProps {
  /** `StoredFile.encryptionKeyId`. Null means the file is stored as plaintext. */
  encryptionKeyId: string | null;
  /**
   * Whether the deployment has ever used encryption at rest. When it hasn't,
   * nothing renders: a "not encrypted" marker on every file in an install that
   * does not use the feature is noise, not information.
   */
  featureInUse: boolean;
}

/**
 * Marks a stored file as encrypted at rest. Carries a text label rather than
 * relying on the padlock alone, so it is not colour or icon only.
 */
export function EncryptedFileBadge({
  encryptionKeyId,
  featureInUse,
}: EncryptedFileBadgeProps) {
  const { t } = useTranslation();
  if (!featureInUse || !encryptionKeyId) return null;

  return (
    <StatusBadge tone="success" size="sm" showDot={false}>
      <span className="portal-enc__badge-row">
        <LockRounded style={{ fontSize: "0.85rem" }} aria-hidden />
        {t("portal.documents.encryptedAtRest")}
      </span>
    </StatusBadge>
  );
}
