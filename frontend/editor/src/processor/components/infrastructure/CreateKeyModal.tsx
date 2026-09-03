import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, CodeBlock, FormField, Input, Modal } from "@app/ui";
import {
  createApiKey,
  type CreatedApiKey,
} from "@processor/api/infrastructure";
import { errorMessage } from "@processor/api/http";

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
          ? t("processor.infrastructure.createKey.titleCreated")
          : t("processor.infrastructure.createKey.title")
      }
      subtitle={
        created
          ? t("processor.infrastructure.createKey.subtitleCreated")
          : t("processor.infrastructure.createKey.subtitle")
      }
      footer={
        created ? (
          <Button variant="primary" onClick={close}>
            {t("processor.infrastructure.createKey.done")}
          </Button>
        ) : (
          <div className="processor-infra__modal-actions">
            <Button variant="tertiary" onClick={close}>
              {t("processor.infrastructure.createKey.cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={name.trim() === "" || submitting}
              onClick={createKey}
            >
              {t("processor.infrastructure.createKey.createKey")}
            </Button>
          </div>
        )
      }
    >
      {created ? (
        <div className="processor-infra__stack">
          <CodeBlock
            code={created.secret}
            lang="bash"
            caption={t("processor.infrastructure.createKey.secretKeyCaption")}
          />
          <Banner
            tone="warning"
            description={t("processor.infrastructure.createKey.secretWarning")}
          />
        </div>
      ) : (
        <div className="processor-infra__form">
          {error && <Banner tone="danger" description={error} />}

          <FormField
            label={t("processor.infrastructure.createKey.keyNameLabel")}
            required
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t(
                "processor.infrastructure.createKey.keyNamePlaceholder",
              )}
            />
          </FormField>
        </div>
      )}
    </Modal>
  );
}
