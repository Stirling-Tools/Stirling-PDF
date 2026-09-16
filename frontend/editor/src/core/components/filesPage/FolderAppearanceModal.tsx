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
 * The colour and icon picker, out of the folder menu and into its own surface.
 * Inline it was taller than everything else in that menu put together, which
 * pushed the actions a reader came for below the fold.
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
