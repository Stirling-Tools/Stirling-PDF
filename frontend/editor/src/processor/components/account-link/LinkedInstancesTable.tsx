import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, EmptyState, Modal } from "@app/ui";
import { ConnectedInstanceRow } from "@app/components/settings/ConnectedInstanceRow";
import type { LinkedInstanceRow } from "@app/types/linkedInstance";

interface Props {
  instances: LinkedInstanceRow[];
  onRevoke: (instance: LinkedInstanceRow) => void;
  revokingId?: number | null;
  excludingCurrent?: boolean;
}

/** Uses the shared cloud row design while retaining the processor's owner-authorized revoke API. */
export function LinkedInstancesTable({
  instances,
  onRevoke,
  revokingId,
  excludingCurrent = false,
}: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<LinkedInstanceRow | null>(null);
  const connected = instances.filter((instance) => !instance.revoked);
  return (
    <>
      {connected.length > 0 ? (
        <ul className="account-connection__list">
          {connected.map((instance) => (
            <ConnectedInstanceRow
              key={instance.instanceId}
              instance={instance}
              busy={revokingId != null}
              onRemove={() => setSelected(instance)}
            />
          ))}
        </ul>
      ) : (
        <EmptyState
          size="compact"
          title={t(
            excludingCurrent
              ? "processor.accountLink.instances.empty.otherTitle"
              : "processor.accountLink.instances.empty.title",
            excludingCurrent
              ? "No other connected instances"
              : "No connected instances",
          )}
          description={t(
            excludingCurrent
              ? "processor.accountLink.instances.empty.otherDescription"
              : "processor.accountLink.instances.empty.description",
            excludingCurrent
              ? "This is the only connected instance shown for your team."
              : "Connect a self-hosted server to your team to see it here.",
          )}
        />
      )}

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        width="sm"
        title={t(
          "settings.connectedInstances.confirmTitle",
          "Remove {{name}}?",
          {
            name:
              selected?.name ??
              t("processor.accountLink.instances.unnamed", "Unnamed instance"),
          },
        )}
        footer={
          <div className="account-connection__actions">
            <Button
              variant="secondary"
              onClick={() => setSelected(null)}
              data-autofocus
            >
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              accent="danger"
              onClick={() => {
                if (selected) onRevoke(selected);
                setSelected(null);
              }}
            >
              {t("settings.connectedInstances.remove", "Remove connection")}
            </Button>
          </div>
        }
      >
        <p>
          {t(
            "settings.connectedInstances.confirmBody",
            "This revokes the instance’s access to your team in Stirling Cloud. It does not delete local files or remove usage already recorded. To connect again, follow the original connection steps on the instance.",
          )}
        </p>
      </Modal>
    </>
  );
}
