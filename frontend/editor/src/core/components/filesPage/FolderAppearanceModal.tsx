import { useTranslation } from "react-i18next";

import { Modal } from "@app/ui/Modal";
import { Button } from "@app/ui/Button";
import { FolderRecord } from "@app/types/folder";
import { FolderAppearancePicker } from "@app/components/filesPage/FolderAppearancePicker";

interface FolderAppearanceModalProps {
  /** The folder being restyled; null closes the modal. */
  folder: FolderRecord | null;
  onClose: () => void;
  onChange: (next: { color?: string; icon?: string | null }) => void;
  disabled?: boolean;
}

/**
 * The folder's colour and icon picker on its own surface, the folder menu having
 * no room for a grid that tall beside the actions a reader came for.
 *
 * There is no cancel: every swatch applies as it is clicked, so the footer
 * dismisses rather than commits.
 */
export function FolderAppearanceModal({
  folder,
  onClose,
  onChange,
  disabled = false,
}: FolderAppearanceModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      open={Boolean(folder)}
      onClose={onClose}
      width="sm"
      title={t("filesPage.appearance.title", "Appearance")}
      subtitle={folder?.name}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t("filesPage.appearance.done", "Done")}
        </Button>
      }
    >
      {folder && (
        <FolderAppearancePicker
          folder={folder}
          onChange={onChange}
          disabled={disabled}
        />
      )}
    </Modal>
  );
}

export default FolderAppearanceModal;
