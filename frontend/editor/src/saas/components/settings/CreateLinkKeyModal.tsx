import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import apiClient from "@app/services/apiClient";
import { Banner, Button, CodeBlock, FormField, Input, Modal } from "@app/ui";

export const LINK_KEYS_PATH = "/api/v1/account-link/keys";

interface CreatedLinkKey {
  keyId: string;
  key: string;
  name: string | null;
  expiresAt: string;
}

/**
 * Issues a one-time key that links a self-hosted server without anyone signing in on it. The key
 * is shown once; Stirling Cloud keeps only its hash.
 */
export function CreateLinkKeyModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t, i18n } = useTranslation();
  const formId = useId();
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post<CreatedLinkKey>(
        LINK_KEYS_PATH,
        { name: name.trim() || null },
        { suppressErrorToast: true },
      );
      return response.data;
    },
    onSuccess: onCreated,
  });
  const created = create.data;

  const close = () => {
    if (create.isPending) return;
    onClose();
    // After the close transition, so the key does not flash away while the modal fades.
    window.setTimeout(() => {
      setName("");
      create.reset();
    }, 200);
  };

  const expires = created
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(
        new Date(created.expiresAt),
      )
    : "";

  return (
    <Modal
      open={open}
      onClose={close}
      width="md"
      title={
        created
          ? t(
              "settings.connectedInstances.linkKey.createdTitle",
              "Link key created",
            )
          : t(
              "settings.connectedInstances.linkKey.title",
              "Add a server with a key",
            )
      }
      disableBackdropClose={create.isPending || Boolean(created)}
      disableEscapeClose={create.isPending}
      footer={
        created ? (
          <Button onClick={close}>
            {t("settings.connectedInstances.linkKey.done", "Done")}
          </Button>
        ) : (
          <div className="account-connection__actions">
            <Button
              variant="secondary"
              onClick={close}
              disabled={create.isPending}
            >
              {t("common.cancel", "Cancel")}
            </Button>
            <Button type="submit" form={formId} loading={create.isPending}>
              {t("settings.connectedInstances.linkKey.create", "Create key")}
            </Button>
          </div>
        )
      }
    >
      {created ? (
        <div className="account-connection__key">
          <CodeBlock
            code={created.key}
            caption={t(
              "settings.connectedInstances.linkKey.caption",
              "Link key",
            )}
          />
          <p>
            {t(
              "settings.connectedInstances.linkKey.instructions",
              "On the server, open Usage & Billing and add it as the license key, or set it as STIRLING_BILLING_ACCOUNT_LINK_KEY.",
            )}
          </p>
          <Banner
            tone="warning"
            description={t(
              "settings.connectedInstances.linkKey.once",
              "Copy it now. It is shown only once, works once, and expires on {{date}}.",
              { date: expires },
            )}
          />
        </div>
      ) : (
        <form
          id={formId}
          className="account-connection__name-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!create.isPending) create.mutate();
          }}
        >
          <FormField
            label={t(
              "settings.connectedInstances.linkKey.name",
              "Server name (optional)",
            )}
          >
            <Input
              value={name}
              maxLength={255}
              onChange={(event) => setName(event.target.value)}
              disabled={create.isPending}
              data-autofocus
            />
          </FormField>
          {create.isError && (
            <Banner tone="danger">
              {t(
                "settings.connectedInstances.linkKey.createError",
                "Couldn’t create the key. Try again.",
              )}
            </Banner>
          )}
        </form>
      )}
    </Modal>
  );
}
