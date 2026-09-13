import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, FormField, Input, Modal } from "@app/ui";
import { errorMessage } from "@portal/api/http";
import { createTeam } from "@portal/api/teams";
import "@portal/views/Users.css";

interface NewTeamModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a team is created so the roster refetches. */
  onCreated: () => void;
}

export function NewTeamModal({ open, onClose, onCreated }: NewTeamModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    onClose();
    setTimeout(() => {
      setName("");
      setError(null);
    }, 200);
  }

  async function submit() {
    setError(null);
    if (!name.trim()) {
      setError(t("users.newTeam.nameRequired", "Team name is required"));
      return;
    }
    setSaving(true);
    try {
      await createTeam(name.trim());
      onCreated();
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      width="sm"
      title={t("users.newTeam.title", "New team")}
      footer={
        <div className="portal-users__modal-footer">
          <Button variant="tertiary" size="sm" onClick={close}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={saving || !name.trim()}
          >
            {t("users.newTeam.create", "Create team")}
          </Button>
        </div>
      }
    >
      <div className="portal-users__invite-body">
        <FormField label={t("users.newTeam.name", "Team name")} required>
          <Input
            placeholder={t("users.newTeam.namePlaceholder", "e.g. Finance")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
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
