import { useState } from "react";
import { Button, FormField, Input, Modal, Select } from "@shared/components";
import { type RoleId, ROLES } from "@portal/api/users";
import "@portal/views/Users.css";

interface InviteMemberModalProps {
  open: boolean;
  onClose: () => void;
}

const ROLE_SELECT_OPTIONS = ROLES.map((r) => ({
  value: r.id,
  label: r.label,
}));

/** Org Owner is reserved for transfer flows — invites default to Developer. */
const DEFAULT_ROLE: RoleId = "developer";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Invite-by-email shell. Submitting validates locally then closes without
 * sending — wiring the submit to the backend dispatches the invitation.
 */
export function InviteMemberModal({ open, onClose }: InviteMemberModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<RoleId>(DEFAULT_ROLE);
  const [touched, setTouched] = useState(false);

  const emailValid = EMAIL_RE.test(email.trim());
  const error =
    touched && !emailValid ? "Enter a valid email address" : undefined;

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
      title="Invite member"
      subtitle="They'll receive an email to join your organization."
      footer={
        <div className="portal-users__modal-footer">
          <Button variant="ghost" size="sm" onClick={close}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={touched && !emailValid}>
            Send invite
          </Button>
        </div>
      }
    >
      <div className="portal-users__invite-body">
        <FormField label="Email" error={error} required>
          <Input
            type="email"
            placeholder="teammate@acme.com"
            value={email}
            invalid={!!error}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched(true)}
          />
        </FormField>
        <FormField
          label="Role"
          helperText="Determines what the member can do once they join."
        >
          <Select
            options={ROLE_SELECT_OPTIONS}
            value={role}
            onChange={(e) => setRole(e.target.value as RoleId)}
          />
        </FormField>
      </div>
    </Modal>
  );
}
