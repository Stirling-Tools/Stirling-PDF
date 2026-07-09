import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, FormField, Input, Modal, Select } from "@app/ui";
import { type RoleId, ROLES } from "@portal/api/users";
import "@portal/views/Users.css";

interface InviteMemberModalProps {
  open: boolean;
  onClose: () => void;
}

// Values hold i18n keys; resolved with t() where the select renders.
const ROLE_SELECT_OPTIONS = ROLES.map((r) => ({
  value: r.id,
  labelKey: r.label,
}));

/** Org Owner is reserved for transfer flows — invites default to Developer. */
const DEFAULT_ROLE: RoleId = "developer";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Invite-by-email shell. Submitting validates locally then closes without
 * sending — wiring the submit to the backend dispatches the invitation.
 */
export function InviteMemberModal({ open, onClose }: InviteMemberModalProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<RoleId>(DEFAULT_ROLE);
  const [touched, setTouched] = useState(false);

  const emailValid = EMAIL_RE.test(email.trim());
  const error =
    touched && !emailValid ? t("portal.users.invite.emailError") : undefined;

  function close() {
    onClose();
    // Reset for the next open, after the close transition has finished.
    setTimeout(() => {
      setEmail("");
      setRole(DEFAULT_ROLE);
      setTouched(false);
    }, 200);
  }

  function submit() {
    setTouched(true);
    if (!emailValid) return;
    // TODO(backend): POST /v1/users/invitations { email, role } — send the
    // invite, then close on success and refetch the members list.
    close();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      width="sm"
      title={t("portal.common.inviteMember")}
      subtitle={t("portal.users.invite.subtitle")}
      footer={
        <div className="portal-users__modal-footer">
          <Button variant="tertiary" size="sm" onClick={close}>
            {t("portal.users.invite.cancel")}
          </Button>
          <Button size="sm" onClick={submit} disabled={touched && !emailValid}>
            {t("portal.users.invite.send")}
          </Button>
        </div>
      }
    >
      <div className="portal-users__invite-body">
        <FormField
          label={t("portal.users.invite.email")}
          error={error}
          required
        >
          <Input
            type="email"
            placeholder={t("portal.users.invite.emailPlaceholder")}
            value={email}
            invalid={!!error}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched(true)}
          />
        </FormField>
        <FormField
          label={t("portal.users.invite.role")}
          helperText={t("portal.users.invite.roleHelper")}
        >
          <Select
            options={ROLE_SELECT_OPTIONS.map((o) => ({
              value: o.value,
              label: t(o.labelKey),
            }))}
            value={role}
            onChange={(value) => setRole((value ?? "") as RoleId)}
          />
        </FormField>
      </div>
    </Modal>
  );
}
