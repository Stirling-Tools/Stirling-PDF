import { useId, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import apiClient from "@editor/services/apiClient";
import { Banner, Button, FormField, Input, Modal } from "@editor/ui";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";

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
  const [copied, setCopied] = useState(false);
  const keyField = useRef<HTMLInputElement>(null);
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
      setCopied(false);
      create.reset();
    }, 200);
  };

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.key);
      setCopied(true);
    } catch {
      // Without clipboard access, leave the key selected for Ctrl+C.
      keyField.current?.focus();
      keyField.current?.select();
    }
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
          <div className="account-connection__actions">
            <Button variant="secondary" onClick={close}>
              {t("settings.connectedInstances.linkKey.done", "Done")}
            </Button>
            <Button onClick={() => void copy()}>
              {copied
                ? t("settings.connectedInstances.linkKey.copied", "Copied")
                : t("settings.connectedInstances.linkKey.copy", "Copy key")}
            </Button>
          </div>
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
        <FormField
          label={t("settings.connectedInstances.linkKey.caption", "Link key")}
          info={t(
            "settings.connectedInstances.linkKey.envHint",
            "A server can also read it from the STIRLING_BILLING_ACCOUNT_LINK_KEY setting.",
          )}
          helperText={t(
            "settings.connectedInstances.linkKey.useIt",
            "Add it as the License key under Usage & Billing on the server. Shown once, works once, expires {{date}}.",
            { date: expires },
          )}
        >
          <Input
            ref={keyField}
            readOnly
            value={created.key}
            className={`account-connection__key ${privateContentClassName}`}
            onFocus={(event) => event.currentTarget.select()}
          />
        </FormField>
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
