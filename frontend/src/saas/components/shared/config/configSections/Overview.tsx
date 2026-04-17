import React, { useState } from "react";
import {
  Alert,
  Avatar,
  Button,
  Divider,
  FileButton,
  Group,
  Image,
  LoadingOverlay,
  PasswordInput,
  Text,
  TextInput,
  Modal,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useAuth } from "@app/auth/UseSession";
import {
  isUserAnonymous,
  linkEmailIdentity,
  linkOAuthIdentity,
  supabase,
} from "@app/auth/supabase";
import { BASE_PATH } from "@app/constants/app";
import { oauthProviders } from "@app/constants/authProviders";
import { Tooltip } from "@app/components/shared/Tooltip";
import { absoluteWithBasePath } from "@app/constants/app";
import { synchronizeUserUpgrade } from "@app/services/userService";
import { ProfilePictureCropper } from "@app/components/shared/config/ProfilePictureCropper";
import { updateProfilePictureMetadata } from "@app/services/avatarSyncService";
import { deleteCurrentAccount } from "@app/services/accountDeletion";
import { alert as showToast } from "@app/components/toast";

interface OverviewProps {
  onLogoutClick: () => void;
}

const Overview: React.FC<OverviewProps> = ({ onLogoutClick }) => {
  const { t } = useTranslation();
  const {
    user,
    refreshSession,
    signOut,
    profilePictureUrl,
    profilePictureMetadata,
    refreshProfilePicture,
    refreshProfilePictureMetadata,
  } = useAuth();

  const PROFILE_BUCKET = "profile-pictures";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [profileUploading, setProfileUploading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [cropperFile, setCropperFile] = useState<File | null>(null);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");

  const isAnonymous = Boolean(user && isUserAnonymous(user));
  const isOAuthPicture = profilePictureMetadata?.source === "oauth";
  const provider = profilePictureMetadata?.provider;

  const profilePath = user ? `${user.id}/avatar` : null;
  const profileInitial = user?.email?.trim()?.charAt(0)?.toUpperCase() || "U";

  const handleProfileUpload = async (file: File | null) => {
    if (!file || !user || !profilePath) {
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setProfileError(
        t(
          "config.account.profilePicture.sizeError",
          "Please select an image smaller than 2MB.",
        ),
      );
      return;
    }

    // Open cropper instead of uploading directly
    setProfileError(null);
    setCropperFile(file);
    setCropperOpen(true);
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    if (!user || !profilePath) {
      return;
    }

    // Validate cropped size (2MB limit)
    if (croppedBlob.size > 2 * 1024 * 1024) {
      setProfileError(
        t(
          "config.account.profilePicture.sizeError",
          "Please select an image smaller than 2MB.",
        ),
      );
      setCropperOpen(false);
      setCropperFile(null);
      return;
    }

    setProfileUploading(true);
    setProfileError(null);

    const { error } = await supabase.storage
      .from(PROFILE_BUCKET)
      .upload(profilePath, croppedBlob, {
        upsert: true,
        cacheControl: "3600",
        contentType: "image/png",
      });

    if (error) {
      setProfileError(error.message || "Failed to upload profile picture");
    } else {
      // Mark as manual upload in metadata
      await updateProfilePictureMetadata(user.id, {
        source: "upload",
        provider: null,
      });
      await refreshProfilePictureMetadata();
      await refreshProfilePicture();
    }

    setProfileUploading(false);
    setCropperOpen(false);
    setCropperFile(null);
  };

  const handleProfileRemove = async () => {
    if (!user || !profilePath) {
      return;
    }

    setProfileUploading(true);
    setProfileError(null);

    const { error } = await supabase.storage
      .from(PROFILE_BUCKET)
      .remove([profilePath]);

    if (error) {
      setProfileError(error.message || "Failed to remove profile picture");
    } else {
      // Clear metadata when removing picture
      await updateProfilePictureMetadata(user.id, {
        source: "upload",
        provider: null,
      });
      await refreshProfilePictureMetadata();
      await refreshProfilePicture();
    }

    setProfileUploading(false);
  };

  const handleUseCustomPicture = async () => {
    if (!user) {
      return;
    }

    setProfileUploading(true);
    setProfileError(null);

    try {
      // Update metadata to allow manual uploads
      await updateProfilePictureMetadata(user.id, {
        source: "upload",
        provider: null,
      });

      await refreshProfilePictureMetadata();
      setSuccess(
        t(
          "config.account.profilePicture.switchedToCustom",
          "Switched to custom picture. You can now upload your own.",
        ),
      );

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (error: unknown) {
      setProfileError(
        error instanceof Error
          ? error.message
          : "Failed to switch to custom picture",
      );
    } finally {
      setProfileUploading(false);
    }
  };

  const handleEmailUpgrade = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setUpgradeError("Email is required");
      return;
    }

    try {
      setIsLoading(true);
      setUpgradeError(null);
      setSuccess(null);

      // First, upgrade the account in Supabase
      await linkEmailIdentity(email.trim(), password || undefined);

      // Synchronize with backend database (using "email" as auth method for email/password)
      await synchronizeUserUpgrade("email");

      // Refresh the session to reflect changes
      await refreshSession();

      setSuccess(
        "Account upgraded successfully! You can now sign in with your email.",
      );
      setEmail("");
      setPassword("");
    } catch (err: unknown) {
      setUpgradeError(
        err instanceof Error ? err.message : "Failed to upgrade account",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthUpgrade = async (
    provider: "github" | "google" | "apple" | "azure",
  ) => {
    try {
      setIsLoading(true);
      setUpgradeError(null);
      setSuccess(null);

      // Store provider info for post-redirect handling
      sessionStorage.setItem("pendingUpgrade", "true");
      sessionStorage.setItem("upgradeProvider", provider);

      // Redirect back to homepage after OAuth completes
      // The UseSession hook will handle the pendingUpgrade synchronization
      const redirectUrl = absoluteWithBasePath("/auth/callback?next=/");
      const result = await linkOAuthIdentity(provider, redirectUrl);

      if (result.data?.url) {
        window.location.href = result.data.url;
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : `Failed to upgrade account with ${provider}`;
      setUpgradeError(errorMessage);
      setIsLoading(false);
      sessionStorage.removeItem("pendingUpgrade");
      sessionStorage.removeItem("upgradeProvider");
    }
  };

  const handleDeleteAccount = async () => {
    if (isAnonymous) return;
    try {
      setIsDeletingAccount(true);
      await deleteCurrentAccount();
      setDeleteModalOpen(false);
      setConfirmEmail("");
      await signOut();
      window.location.href = absoluteWithBasePath("/login");
    } catch (err) {
      const fallbackMessage = t(
        "config.account.overview.deleteFailed",
        "Failed to delete account.",
      );
      const message = err instanceof Error ? err.message : fallbackMessage;
      console.error("[Overview] Delete account failed:", err);
      showToast({
        alertType: "error",
        title: t(
          "config.account.overview.deleteFailedTitle",
          "Unable to delete account",
        ),
        body: message,
        expandable: true,
        location: "top-right",
        durationMs: 7000,
      });
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setConfirmEmail("");
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
        position: "relative",
      }}
    >
      <LoadingOverlay visible={isLoading || isDeletingAccount} />

      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
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
              {t("config.account.overview.title", "Account Settings")}
            </h3>
            <p
              style={{
                margin: "0.25rem 0 0 0",
                color: "var(--mantine-color-dimmed)",
                fontSize: "0.875rem",
              }}
            >
              {isAnonymous
                ? t(
                    "config.account.overview.guestDescription",
                    "You are signed in as a guest. Consider upgrading your account below.",
                  )
                : t(
                    "config.account.overview.manageAccountPreferences",
                    "Manage your account preferences",
                  )}
            </p>
            {user?.email && (
              <p
                style={{
                  margin: "0.25rem 0 0 0",
                  color: "var(--mantine-color-dimmed)",
                  fontSize: "0.75rem",
                }}
              >
                {t("config.account.overview.signedInAs", "Signed in as")}:{" "}
                {user.email}
              </p>
            )}
          </div>
          <Button color="red" variant="filled" onClick={onLogoutClick}>
            {t("logOut", "Log out")}
          </Button>
        </div>
      </div>

      <Divider />

      <div>
        <h3
          style={{
            margin: 0,
            color: "var(--mantine-color-text)",
            fontSize: "1rem",
          }}
        >
          {t("config.account.profilePicture.title", "Profile picture")}
        </h3>
        <p
          style={{
            margin: "0.25rem 0 1rem 0",
            color: "var(--mantine-color-dimmed)",
            fontSize: "0.875rem",
          }}
        >
          {t(
            "config.account.profilePicture.description",
            "Upload an image to personalize your account.",
          )}
        </p>

        {profileError && (
          <Alert color="red" mb="md">
            {profileError}
          </Alert>
        )}

        {success && (
          <Alert color="green" mb="md">
            {success}
          </Alert>
        )}

        {isOAuthPicture ? (
          <Group align="center" gap="md">
            <Avatar
              src={profilePictureUrl || undefined}
              radius="xl"
              size={72}
              color="blue"
            >
              {profileInitial}
            </Avatar>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <Text size="sm" c="dimmed">
                {t(
                  "config.account.profilePicture.usingProvider",
                  "Using {{provider}} profile picture",
                  {
                    provider: provider
                      ? provider.charAt(0).toUpperCase() + provider.slice(1)
                      : "OAuth",
                  },
                )}
              </Text>
              <Button
                variant="outline"
                onClick={handleUseCustomPicture}
                disabled={profileUploading}
              >
                {t(
                  "config.account.profilePicture.useCustom",
                  "Use custom picture",
                )}
              </Button>
            </div>
          </Group>
        ) : (
          <Group align="center" gap="md">
            <Avatar
              src={profilePictureUrl || undefined}
              radius="xl"
              size={72}
              color="blue"
            >
              {profileInitial}
            </Avatar>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <Group gap="sm">
                <FileButton
                  onChange={handleProfileUpload}
                  accept="image/png,image/jpeg,image/webp"
                  disabled={!user || profileUploading}
                >
                  {(props) => (
                    <Button {...props} loading={profileUploading}>
                      {t("config.account.profilePicture.upload", "Upload")}
                    </Button>
                  )}
                </FileButton>
                <Button
                  variant="outline"
                  onClick={handleProfileRemove}
                  disabled={!profilePictureUrl || profileUploading}
                >
                  {t("config.account.profilePicture.remove", "Remove")}
                </Button>
              </Group>
              <Text size="xs" c="var(--mantine-color-dimmed)">
                {t(
                  "config.account.profilePicture.help",
                  "PNG, JPG, or WebP up to 2MB.",
                )}
              </Text>
            </div>
          </Group>
        )}
      </div>

      <ProfilePictureCropper
        file={cropperFile}
        opened={cropperOpen}
        onClose={() => {
          setCropperOpen(false);
          setCropperFile(null);
        }}
        onCropComplete={handleCropComplete}
      />

      {isAnonymous && <Divider />}

      {isAnonymous && (
        <div>
          <div>
            <h3
              style={{
                margin: 0,
                color: "var(--mantine-color-text)",
                fontSize: "1rem",
              }}
            >
              {t("config.account.upgrade.title", "Upgrade Guest Account")}
            </h3>
            <p
              style={{
                margin: "0.25rem 0 1rem 0",
                color: "var(--mantine-color-dimmed)",
                fontSize: "0.875rem",
              }}
            >
              {t(
                "config.account.upgrade.description",
                "Link your account to preserve your history and access more features!",
              )}
            </p>
          </div>

          {upgradeError && (
            <Alert color="red" mb="md">
              {upgradeError}
            </Alert>
          )}

          {success && (
            <Alert color="green" mb="md">
              {success}
            </Alert>
          )}

          <div style={{ marginBottom: "1rem" }}>
            <Text size="sm" fw={500} mb="xs" c="var(--mantine-color-dimmed)">
              {t(
                "config.account.upgrade.socialLogin",
                "Upgrade with Social Account",
              )}
            </Text>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {oauthProviders
                .filter((provider) => !provider.isDisabled)
                .map((provider) => (
                  <Tooltip
                    key={provider.id}
                    content={`${t("config.account.upgrade.linkWith", "Link with")} ${provider.label}`}
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      leftSection={
                        <Image
                          src={`${BASE_PATH}/Login/${provider.file}`}
                          alt={provider.label}
                          style={{ width: 16, height: 16 }}
                        />
                      }
                      onClick={() =>
                        handleOAuthUpgrade(
                          provider.id as
                            | "github"
                            | "google"
                            | "apple"
                            | "azure",
                        )
                      }
                      disabled={isLoading}
                    >
                      {provider.label}
                    </Button>
                  </Tooltip>
                ))}
            </div>
          </div>

          <div>
            <Text size="sm" fw={500} mb="xs" c="var(--mantine-color-dimmed)">
              {t(
                "config.account.upgrade.emailPassword",
                "or enter your email & password",
              )}
            </Text>
            <form onSubmit={handleEmailUpgrade}>
              <Group align="end" gap="sm">
                <TextInput
                  label={t("config.account.upgrade.email", "Email")}
                  placeholder={t(
                    "config.account.upgrade.emailPlaceholder",
                    "Enter your email",
                  )}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{ flex: 1 }}
                />
                <PasswordInput
                  label={t(
                    "config.account.upgrade.password",
                    "Password (optional)",
                  )}
                  placeholder={t(
                    "config.account.upgrade.passwordPlaceholder",
                    "Set a password",
                  )}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  description={t(
                    "config.account.upgrade.passwordNote",
                    "Leave empty to use email verification only",
                  )}
                  style={{ flex: 1 }}
                />
                <Button type="submit" disabled={isLoading}>
                  {t("config.account.upgrade.upgradeButton", "Upgrade Account")}
                </Button>
              </Group>
            </form>
          </div>
        </div>
      )}

      {/* Delete Account Section */}
      {!isAnonymous && (
        <div
          style={{
            marginTop: "auto",
            paddingTop: "1.5rem",
            display: "flex",
            justifyContent: "flex-end",
            borderTop: "1px solid var(--mantine-color-default-border)",
          }}
        >
          <Button
            color="red"
            variant="outline"
            onClick={() => setDeleteModalOpen(true)}
          >
            {t("config.account.overview.deleteAccount", "Delete Account")}
          </Button>
        </div>
      )}

      {/* Delete Account Confirmation Modal */}
      <Modal
        opened={deleteModalOpen}
        onClose={closeDeleteModal}
        title={t(
          "config.account.overview.deleteAccountTitle",
          "Delete Account",
        )}
        centered
        zIndex={10000}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (confirmEmail.toLowerCase() === user?.email?.toLowerCase()) {
              handleDeleteAccount();
            }
          }}
        >
          <Text size="sm" mb="md">
            {t(
              "config.account.overview.deleteWarning",
              "This action is permanent and cannot be undone. All your data will be deleted.",
            )}
          </Text>
          <Text size="sm" fw={500} mb="xs">
            {t(
              "config.account.overview.enterEmailConfirm",
              "To confirm deletion, please type your email address ({{email}}) below:",
              { email: user?.email },
            )}
          </Text>
          <TextInput
            placeholder={user?.email || ""}
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            mb="md"
          />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={closeDeleteModal} type="button">
              {t("cancel", "Cancel")}
            </Button>
            <Button
              color="red"
              disabled={
                confirmEmail.toLowerCase() !== user?.email?.toLowerCase()
              }
              type="submit"
              loading={isDeletingAccount}
            >
              {t("config.account.overview.confirmDelete", "Delete My Account")}
            </Button>
          </Group>
        </form>
      </Modal>
    </div>
  );
};

export default Overview;
