import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, FormField, Input, Modal } from "@app/ui";
import { renameTeam } from "@portal/api/teams";
import { errorMessage } from "@portal/api/http";
import "@portal/views/Users.css";

interface RenameTeamModalProps {
  open: boolean;
  teamId: number | null;
  currentName: string;
  onClose: () => void;
  onDone: () => void;
}

/** Rename a team. */
export function RenameTeamModal({
  open,
  teamId,
  currentName,
  onClose,
  onDone,
}: RenameTeamModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(currentName);
    setError(null);
  }, [open, currentName]);

  async function submit() {
    if (teamId == null || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await renameTeam(teamId, name.trim());
      onDone();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="sm"
      title={t("users.renameTeam.title", "Rename team")}
      footer={
        <div className="portal-users__modal-footer">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={saving || !name.trim()}
          >
            {t("users.renameTeam.apply", "Rename")}
          </Button>
        </div>
      }
    >
      <div className="portal-users__invite-body">
        <FormField label={t("users.renameTeam.name", "Team name")} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        {error && (
          <p className="portal-users__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
