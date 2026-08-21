import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, CodeBlock, FormField, Input, Modal } from "@app/ui";
import { createApiKey, type CreatedApiKey } from "@portal/api/infrastructure";
import { errorMessage } from "@portal/api/http";

export function CreateKeyModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** Called after a successful create so the tab can refresh its list. */
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setCreated(null);
    setSubmitting(false);
    setError(null);
  }

  function close() {
    onClose();
    // Defer reset so the modal doesn't flash empty during its close transition.
    setTimeout(reset, 200);
  }

  async function createKey() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await createApiKey({ name: name.trim() });
      setCreated(result);
      onCreated();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      width="md"
      title={
        created
          ? t("portal.infrastructure.createKey.titleCreated")
          : t("portal.infrastructure.createKey.title")
      }
      subtitle={
        created
          ? t("portal.infrastructure.createKey.subtitleCreated")
          : t("portal.infrastructure.createKey.subtitle")
      }
      footer={
        created ? (
          <Button variant="primary" onClick={close}>
            {t("portal.infrastructure.createKey.done")}
          </Button>
        ) : (
          <div className="portal-infra__modal-actions">
            <Button variant="tertiary" onClick={close}>
              {t("portal.infrastructure.createKey.cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={name.trim() === "" || submitting}
              onClick={createKey}
            >
              {t("portal.infrastructure.createKey.createKey")}
            </Button>
          </div>
        )
      }
    >
      {created ? (
        <div className="portal-infra__stack">
          <CodeBlock
            code={created.secret}
            lang="bash"
            caption={t("portal.infrastructure.createKey.secretKeyCaption")}
          />
          <Banner
            tone="warning"
            description={t("portal.infrastructure.createKey.secretWarning")}
          />
        </div>
      ) : (
        <div className="portal-infra__form">
          {error && <Banner tone="danger" description={error} />}

          <FormField
            label={t("portal.infrastructure.createKey.keyNameLabel")}
            required
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t(
                "portal.infrastructure.createKey.keyNamePlaceholder",
              )}
            />
          </FormField>
        </div>
      )}
    </Modal>
  );
}
