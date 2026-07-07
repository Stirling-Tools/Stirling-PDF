import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Banner,
  Button,
  Checkbox,
  CodeBlock,
  FormField,
  Input,
  Modal,
} from "@app/ui";
import type { ApiKeyPermission } from "@portal/api/infrastructure";

const PERMISSION_OPTS: ApiKeyPermission[] = ["Read", "Write", "Admin"];

// Shown once after a key is created. TODO(backend): use the one-time secret
// returned by POST /v1/infrastructure/api-keys — it is never persisted server-side.
const DEMO_NEW_KEY_SECRET = "sk_live_demo_key_rotate_in_prod";

export function CreateKeyModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [perms, setPerms] = useState<ApiKeyPermission[]>(["Read"]);
  const [ips, setIps] = useState("");
  const [created, setCreated] = useState(false);

  function reset() {
    setName("");
    setPerms(["Read"]);
    setIps("");
    setCreated(false);
  }

  function close() {
    onClose();
    // Defer reset so the modal doesn't flash empty during its close transition.
    setTimeout(reset, 200);
  }

  function togglePerm(p: ApiKeyPermission) {
    setPerms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  }

  function createKey() {
    // TODO(backend): POST /v1/infrastructure/api-keys { name, perms, ips }
    // and render the one-time secret from the response instead of the fixture.
    setCreated(true);
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
          <Button variant="gradient" onClick={close}>
            {t("portal.infrastructure.createKey.done")}
          </Button>
        ) : (
          <div className="portal-infra__modal-actions">
            <Button variant="ghost" onClick={close}>
              {t("portal.infrastructure.createKey.cancel")}
            </Button>
            <Button
              variant="gradient"
              disabled={name.trim() === "" || perms.length === 0}
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
            code={DEMO_NEW_KEY_SECRET}
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

          <FormField
            label={t("portal.infrastructure.createKey.permissionsLabel")}
          >
            <div className="portal-infra__perm-row">
              {PERMISSION_OPTS.map((p) => (
                <Checkbox
                  key={p}
                  label={p}
                  checked={perms.includes(p)}
                  onChange={() => togglePerm(p)}
                />
              ))}
            </div>
          </FormField>

          <FormField
            label={t("portal.infrastructure.createKey.ipAllowlistLabel")}
            helperText={t("portal.infrastructure.createKey.ipAllowlistHelper")}
          >
            <Input
              value={ips}
              onChange={(e) => setIps(e.target.value)}
              placeholder="52.14.0.0/16, 203.0.113.7/32"
            />
          </FormField>
        </div>
      )}
    </Modal>
  );
}
