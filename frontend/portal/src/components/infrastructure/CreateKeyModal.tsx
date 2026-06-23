import { useState } from "react";
import {
  Banner,
  Button,
  Checkbox,
  CodeBlock,
  FormField,
  Input,
  Modal,
} from "@shared/components";
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
      title={created ? "Key created" : "Create API key"}
      subtitle={
        created
          ? "Copy this secret now — it won't be shown again."
          : "Scope the key to the minimum it needs. You can rotate or revoke at any time."
      }
      footer={
        created ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <div className="portal-infra__modal-actions">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              disabled={name.trim() === "" || perms.length === 0}
              onClick={createKey}
            >
              Create key
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
            caption="Secret key"
          />
          <Banner
            tone="warning"
            description="Store this in a secrets manager. Stirling only ever stores a hash — there is no way to recover it later."
          />
        </div>
      ) : (
        <div className="portal-infra__form">
          <FormField label="Key name" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production · ingest"
            />
          </FormField>

          <FormField label="Permissions">
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
            label="IP allowlist"
            helperText="Comma-separated CIDR ranges. Leave blank to allow any IP."
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
