import React, { useState } from "react";
import {
  Button,
  PasswordInput,
  Group,
  Alert,
  LoadingOverlay,
  Modal,
  Divider,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useAuth } from "@app/auth/UseSession";
import { supabase } from "@app/auth/supabase";
import { Z_INDEX_OVER_SETTINGS_MODAL } from "@app/styles/zIndex";

const PasswordSecurity: React.FC = () => {
  const { t } = useTranslation();
  const { refreshSession } = useAuth();

  const [opened, setOpened] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [didUpdate, setDidUpdate] = useState(false);

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      setError(t("signup.pleaseFillAllFields", "Please fill in all fields"));
      return;
    }
    if (newPassword.length < 6) {
      setError(
        t(
          "signup.passwordTooShort",
          "Password must be at least 6 characters long",
        ),
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("signup.passwordsDoNotMatch", "Passwords do not match"));
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setSuccess(null);

      // Update to the new password directly
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccess(
        t(
          "login.passwordUpdatedSuccess",
          "Your password has been updated successfully.",
        ),
      );
      setNewPassword("");
      setConfirmPassword("");
      setDidUpdate(true);

      // Replace form with success text, then close after 2s
      setTimeout(() => {
        // refresh session after closing to avoid UI jank
        void refreshSession();
        setOpened(false);
        setDidUpdate(false);
      }, 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to change password");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <LoadingOverlay visible={isLoading} />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              color: "var(--mantine-color-text)",
              fontSize: "1rem",
            }}
          >
            {t("config.account.security.title", "Passwords & Security")}
          </h3>
          <p
            style={{
              margin: "0.25rem 0 1rem 0",
              color: "var(--mantine-color-dimmed)",
              fontSize: "0.875rem",
            }}
          >
            {t(
              "config.account.security.description",
              "Manage your password and security settings.",
            )}
          </p>
        </div>
        <Button type="button" onClick={() => setOpened(true)} variant="filled">
          {t("config.account.security.changePassword", "Change password")}
        </Button>
      </div>

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        centered
        title={t("config.account.security.changePassword", "Change password")}
        zIndex={Z_INDEX_OVER_SETTINGS_MODAL}
      >
        {error && (
          <Alert color="red" mb="md">
            {error}
          </Alert>
        )}

        {didUpdate ? (
          <Alert color="green" mb="md">
            {success ||
              t(
                "login.passwordUpdatedSuccess",
                "Your password has been updated successfully.",
              )}
          </Alert>
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
          >
            <PasswordInput
              label={t("account.newPassword", "New Password")}
              placeholder={t("account.newPassword", "New Password")}
              value={newPassword}
              onChange={(e) => setNewPassword(e.currentTarget.value)}
            />
            <PasswordInput
              label={t("account.confirmNewPassword", "Confirm New Password")}
              placeholder={t(
                "account.confirmNewPassword",
                "Confirm New Password",
              )}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.currentTarget.value)}
            />

            <Divider my="sm" />
            <Group justify="flex-end">
              <Button
                type="button"
                variant="default"
                onClick={() => setOpened(false)}
              >
                {t("common.cancel", "Cancel")}
              </Button>
              <Button
                type="button"
                onClick={handleChangePassword}
                loading={isLoading}
              >
                {t("config.account.security.update", "Update password")}
              </Button>
            </Group>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default PasswordSecurity;
