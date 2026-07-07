import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, FormField, Modal, Select } from "@app/ui";
import { moveMemberToTeam, type Member } from "@portal/api/users";
import type { Team } from "@portal/api/teams";
import { errorMessage } from "@portal/api/http";
import "@portal/views/Users.css";

interface MoveToTeamModalProps {
  open: boolean;
  member: Member | null;
  teams: Team[];
  onClose: () => void;
  onDone: () => void;
}

/** Move a member to a different team (keeps their role). */
export function MoveToTeamModal({
  open,
  member,
  teams,
  onClose,
  onDone,
}: MoveToTeamModalProps) {
  const { t } = useTranslation();
  const [teamId, setTeamId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = teams
    .filter((tm) => tm.id !== member?.teamId)
    .map((tm) => ({ value: String(tm.id), label: tm.name }));

  useEffect(() => {
    if (!open) return;
    const first = teams.find((tm) => tm.id !== member?.teamId);
    setTeamId(first ? String(first.id) : "");
    setError(null);
  }, [open, teams, member]);

  async function submit() {
    if (!member || !teamId) return;
    setSaving(true);
    setError(null);
    try {
      await moveMemberToTeam(member, Number(teamId));
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
      title={t("users.moveTeam.title", "Move to team")}
      subtitle={member?.name}
      footer={
        <div className="portal-users__modal-footer">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={saving || !teamId}
          >
            {t("users.moveTeam.apply", "Move")}
          </Button>
        </div>
      }
    >
      <div className="portal-users__invite-body">
        <FormField label={t("users.moveTeam.team", "Team")}>
          <Select
            options={options}
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
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
