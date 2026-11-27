import { useId, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import apiClient from "@editor/services/apiClient";
import { Banner, Button, FormField, Input, Modal } from "@editor/ui";
import { InfoTooltip } from "@editor/ui/InfoTooltip";
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
      title={t("settings.connectedInstances.linkKey.title", "Add an instance")}
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
        <ol className="account-connection__steps">
          <li>
            <p>
              {t(
                "settings.connectedInstances.linkKey.step.copy",
                "Copy this link key. It works once and expires on {{date}}.",
                { date: expires },
              )}
            </p>
            <Input
              ref={keyField}
              readOnly
              value={created.key}
              aria-label={t(
                "settings.connectedInstances.linkKey.caption",
                "Link key",
              )}
              className={`account-connection__key ${privateContentClassName}`}
              onFocus={(event) => event.currentTarget.select()}
            />
          </li>
          <li>
            <p>
              {t(
                "settings.connectedInstances.linkKey.step.open",
                "On the instance, sign in as the admin and open Settings, then Usage & Billing.",
              )}
            </p>
          </li>
          <li>
            <p>
              {t(
                "settings.connectedInstances.linkKey.step.paste",
                "Next to License key, select Add, paste the key and select Connect. The instance then appears in this list.",
              )}{" "}
              <InfoTooltip
                label={t(
                  "settings.connectedInstances.linkKey.envHint",
                  "An instance can also read the key from the STIRLING_BILLING_ACCOUNT_LINK_KEY setting.",
                )}
              />
            </p>
          </li>
        </ol>
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
              "Instance name (optional)",
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
