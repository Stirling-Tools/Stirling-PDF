import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, FormField, Input, Modal } from "@app/ui";
import { errorMessage } from "@portal/api/http";
import { createTeam, fetchTeams, setTeamOwner } from "@portal/api/teams";
import { fetchUsers, inviteMember } from "@portal/api/users";
import { useTier } from "@portal/contexts/TierContext";
import "@portal/views/Users.css";

interface NewTeamModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a team is created so the roster refetches. */
  onCreated: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Create a team and optionally invite its owner. The team is created first, so
 * even if the owner invite needs mail (unavailable) the team still lands and an
 * owner can be assigned from the roster.
 */
export function NewTeamModal({ open, onClose, onCreated }: NewTeamModalProps) {
  const { t } = useTranslation();
  const { tier } = useTier();
  const [name, setName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function close() {
    onClose();
    setTimeout(() => {
      setName("");
      setOwnerEmail("");
      setError(null);
      setNote(null);
    }, 200);
  }

  async function inviteOwner(teamName: string, email: string) {
    const teams = await fetchTeams();
    const team = teams.find((tm) => tm.name === teamName);
    if (!team) return;
    await inviteMember(email, "member", team.id);
    const { members } = await fetchUsers(tier);
    const owner = members.find(
      (m) => m.email === email || m.username === email,
    );
    if (owner) await setTeamOwner(team.id, owner.id);
  }

  async function submit() {
    setError(null);
    setNote(null);
    if (!name.trim()) {
      setError(t("users.newTeam.nameRequired", "Team name is required"));
      return;
    }
    const email = ownerEmail.trim();
    if (email && !EMAIL_RE.test(email)) {
      setError(t("users.newTeam.emailError", "Enter a valid email address"));
      return;
    }
    setSaving(true);
    try {
      await createTeam(name.trim());
      let ownerFailed = false;
      if (email) {
        try {
          await inviteOwner(name.trim(), email);
        } catch {
          // Team is created; keep the modal open so this recovery note stays
          // readable (owner invite needs mail, can be redone from the roster).
          ownerFailed = true;
          setNote(
            t(
              "users.newTeam.ownerFailed",
              "Team created, but the owner couldn't be invited. Assign one from the roster.",
            ),
          );
        }
      }
      onCreated();
      if (!ownerFailed) close();
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
      subtitle={t(
        "users.newTeam.subtitle",
        "Group people under a Team Owner who manages their access.",
      )}
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
        <FormField
          label={t("users.newTeam.owner", "Team Owner")}
          helperText={t(
            "users.newTeam.ownerHelper",
            "Every team has a leader. They'll be invited as Team Owner, with the Processor on, and can add the rest. You can reassign later.",
          )}
        >
          <Input
            type="email"
            placeholder={t(
              "users.newTeam.ownerPlaceholder",
              "owner@company.com",
            )}
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
          />
        </FormField>
        {note && (
          <p className="portal-users__form-note" role="status">
            {note}
          </p>
        )}
        {error && (
          <p className="portal-users__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
