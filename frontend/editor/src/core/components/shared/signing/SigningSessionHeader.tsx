import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@app/ui/Avatar";
import { Icon } from "@app/ui/Icon";
import "@app/components/shared/signing/signingDetail.css";

interface SigningSessionHeaderProps {
  documentName: string;
  owner: string;
  createdAt: string;
  dueDate: string;
  message: string;
  status: ReactNode;
  actions?: ReactNode;
}

/** Shared document and sender information for owner and participant session views. */
export function SigningSessionHeader({
  documentName,
  owner,
  createdAt,
  dueDate,
  message,
  status,
  actions,
}: SigningSessionHeaderProps) {
  const { t } = useTranslation();
  return (
    <header className="signing-detail__header">
      <div className="signing-detail__header-row">
        {status}
        {actions}
      </div>
      <h2>{documentName}</h2>
      <div className="signing-detail__sender">
        {owner && <Avatar name={owner} size="sm" tone="neutral" />}
        <div>
          <span>
            {owner
              ? `${t("certSign.collab.signRequest.from", "From")}: ${owner}`
              : t("signWorkspace.createdByMe", "Created by me")}
          </span>
          <time dateTime={createdAt}>
            {new Date(createdAt).toLocaleDateString()}
          </time>
        </div>
      </div>
      {dueDate && (
        <div className="signing-detail__due">
          <Icon name="calendar" size={16} />
          <span>
            {t("certSign.collab.sessionDetail.dueDate", "Due Date")}:{" "}
            <time dateTime={dueDate}>
              {new Date(
                `${dueDate.slice(0, 10)}T00:00:00`,
              ).toLocaleDateString()}
            </time>
          </span>
        </div>
      )}
      {message && (
        <div className="signing-detail__message">
          <h3>{t("certSign.collab.sessionDetail.messageLabel", "Message")}</h3>
          <p>{message}</p>
        </div>
      )}
    </header>
  );
}
