import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Checkbox, FormField, Input, Modal } from "@app/ui";
import { resetMemberPassword, type Member } from "@portal/api/users";
import { errorMessage } from "@portal/api/http";
import "@portal/views/Users.css";

interface ResetPasswordModalProps {
  open: boolean;
  member: Member | null;
  /** SMTP configured - gates the "email the password" options. */
  mailEnabled: boolean;
  onClose: () => void;
  onDone: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Cryptographically secure password with rejection sampling (no modulo bias). */
function generatePassword(len = 16): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*";
  const max = Math.floor(256 / chars.length) * chars.length;
  const out: string[] = [];
  const buf = new Uint8Array(1);
  while (out.length < len) {
    crypto.getRandomValues(buf);
    if (buf[0] < max) out.push(chars[buf[0] % chars.length]);
  }
  return out.join("");
}

/** Admin reset of a member's password: auto-generate (with copy) or set manually. */
export function ResetPasswordModal({
  open,
  member,
  mailEnabled,
  onClose,
  onDone,
}: ResetPasswordModalProps) {
  const { t } = useTranslation();
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [generated, setGenerated] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [forceChange, setForceChange] = useState(true);
  const [sendEmail, setSendEmail] = useState(false);
  const [includePassword, setIncludePassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canEmail = mailEnabled && EMAIL_RE.test(member?.email ?? "");

  useEffect(() => {
    if (!open) return;
    setAutoGenerate(true);
    setGenerated(generatePassword());
    setPassword("");
    setConfirm("");
    setForceChange(true);
    setSendEmail(false);
    setIncludePassword(false);
    setCopied(false);
    setError(null);
  }, [open]);

  function copy() {
    void navigator.clipboard?.writeText(generated).then(() => setCopied(true));
  }

  async function submit() {
    if (!member) return;
    setError(null);
    const newPassword = autoGenerate ? generated : password;
    if (!autoGenerate) {
      if (newPassword.length < 8) {
        setError(
          t("users.resetPw.tooShort", "Password must be at least 8 characters"),
        );
        return;
      }
      if (newPassword !== confirm) {
        setError(t("users.resetPw.mismatch", "Passwords do not match"));
        return;
      }
    }
    setSaving(true);
    try {
      await resetMemberPassword(member, {
        newPassword,
        forcePasswordChange: forceChange,
        sendEmail: canEmail && sendEmail,
        includePassword: canEmail && sendEmail && includePassword,
      });
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
      title={t("users.resetPw.title", "Reset password")}
      subtitle={member?.name}
      footer={
        <div className="portal-users__modal-footer">
          <Button variant="tertiary" size="sm" onClick={onClose}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={saving}>
            {t("users.resetPw.apply", "Reset password")}
          </Button>
        </div>
      }
    >
      <div className="portal-users__invite-body">
        <Checkbox
          checked={autoGenerate}
          onChange={(e) => setAutoGenerate(e.target.checked)}
          label={t("users.resetPw.generate", "Generate a secure password")}
        />

        {autoGenerate ? (
          <FormField
            label={t("users.resetPw.newPassword", "New password")}
            helperText={
              copied
                ? t("users.resetPw.copied", "Copied to clipboard")
                : t(
                    "users.resetPw.copyHint",
                    "Copy this now - it won't be shown again.",
                  )
            }
          >
            <div className="portal-users__pw-row">
              <Input value={generated} readOnly />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setGenerated(generatePassword())}
              >
                {t("users.resetPw.regen", "Regenerate")}
              </Button>
              <Button variant="secondary" size="sm" onClick={copy}>
                {t("common.copy", "Copy")}
              </Button>
            </div>
          </FormField>
        ) : (
          <>
            <FormField label={t("users.resetPw.newPassword", "New password")}>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormField>
            <FormField label={t("users.resetPw.confirm", "Confirm password")}>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </FormField>
          </>
        )}

        <Checkbox
          checked={forceChange}
          onChange={(e) => setForceChange(e.target.checked)}
          label={t(
            "users.resetPw.forceChange",
            "Require a password change on next login",
          )}
        />

        {canEmail && (
          <>
            <Checkbox
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              label={t("users.resetPw.email", "Email the user about the reset")}
            />
            <Checkbox
              checked={includePassword}
              disabled={!sendEmail}
              onChange={(e) => setIncludePassword(e.target.checked)}
              label={t(
                "users.resetPw.includePw",
                "Include the new password in the email",
              )}
            />
          </>
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
