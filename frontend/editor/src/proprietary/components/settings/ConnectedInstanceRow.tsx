import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import type { LinkedInstanceRow } from "@app/types/linkedInstance";
import "@app/components/settings/AccountConnectionLayout.css";

interface Props {
  instance: LinkedInstanceRow;
  busy?: boolean;
  onRename?: () => void;
  onRemove: () => void;
}

/** Active connection identity with optional name editing and collapsed technical details. */
export function ConnectedInstanceRow({
  instance,
  busy,
  onRename,
  onRemove,
}: Props) {
  const { t, i18n } = useTranslation();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const formatDate = (value: string | null) => {
    const date = value ? new Date(value) : null;
    return !date || Number.isNaN(date.getTime())
      ? t("settings.connectedInstances.unknown", "Not available")
      : new Intl.DateTimeFormat(i18n.language, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(date);
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(instance.deviceId);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  };

  return (
    <li className="account-connection__row">
      <div className="account-connection__identity">
        <div className="account-connection__name">
          <h3>
            {instance.name ??
              t("portal.accountLink.instances.unnamed", "Unnamed instance")}
          </h3>
          {onRename && (
            <Button
              variant="quiet"
              size="sm"
              disabled={busy}
              onClick={onRename}
            >
              {t("settings.connectedInstances.editName", "Edit name")}
            </Button>
          )}
        </div>
        {!instance.revoked && (
          <p>
            {t("settings.connectedInstances.lastSeen", "Last seen: {{date}}", {
              date: formatDate(instance.lastSeenAt),
            })}
          </p>
        )}
        <details className="account-connection__details">
          <summary>
            {t("settings.connectedInstances.details", "Details")}
          </summary>
          <dl>
            <div>
              <dt>{t("settings.connectedInstances.id", "Instance ID")}</dt>
              <dd>
                <code>{instance.deviceId}</code>{" "}
                <Button variant="quiet" size="sm" onClick={() => void copyId()}>
                  {t("settings.connectedInstances.copyId", "Copy ID")}
                </Button>
              </dd>
            </div>
            <div>
              <dt>
                {t("settings.connectedInstances.connectedDate", "Connected")}
              </dt>
              <dd>{formatDate(instance.createdAt)}</dd>
            </div>
          </dl>
          <span role="status">
            {copyState === "copied"
              ? t("settings.connectedInstances.copied", "ID copied")
              : copyState === "error"
                ? t(
                    "settings.connectedInstances.copyError",
                    "Couldn’t copy the ID. Select it to copy manually.",
                  )
                : ""}
          </span>
        </details>
      </div>
      <Button
        variant="quiet"
        accent="danger"
        size="sm"
        disabled={busy}
        onClick={onRemove}
      >
        {t("settings.connectedInstances.remove", "Remove connection")}
      </Button>
    </li>
  );
}
