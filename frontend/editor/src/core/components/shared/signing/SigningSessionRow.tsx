import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "@app/ui/Icon";
import type { SigningIntent } from "@app/utils/pendingSigningIntent";
import { needsSignature, type SigningMenuItem } from "@app/utils/signingItems";
import { signingStatus } from "@app/utils/signingStatus";
import { SigningActivityDot } from "@app/components/shared/signing/SigningActivityDot";

interface SigningSessionRowProps {
  item: SigningMenuItem;
  onOpenSigning: (intent: SigningIntent) => void;
}

function rowIcon(item: SigningMenuItem): IconName {
  if (needsSignature(item)) return "pen-tool";
  return item.kind === "session" ? "users" : "file-text";
}

export function SigningSessionRow({
  item,
  onOpenSigning,
}: SigningSessionRowProps) {
  const { t } = useTranslation();
  const state = needsSignature(item)
    ? t("signWorkspace.needsYou", "Needs your signature")
    : signingStatus(item, t).label;
  return (
    <li>
      <button
        type="button"
        className="sign-menu__session"
        data-unread={item.unread}
        onClick={() =>
          onOpenSigning({
            kind: item.kind,
            sessionId: item.sessionId,
          })
        }
      >
        <span className="sign-menu__session-icon">
          <Icon name={rowIcon(item)} size={19} />
        </span>
        <span className="sign-menu__session-copy">
          <span className="sign-menu__document-heading">
            <span className="sign-menu__document" title={item.documentName}>
              {item.documentName}
            </span>
            {item.unread && <SigningActivityDot />}
          </span>
          <span className="sign-menu__state">{state}</span>
          <span className="sign-menu__meta">
            {item.kind === "request"
              ? `${t("certSign.collab.signRequest.from", "From")}: ${item.ownerUsername}`
              : t(
                  "signMenu.ownerProgress",
                  "Your request · {{signed}} / {{total}} signed",
                  {
                    signed: item.signedCount,
                    total: item.participantCount,
                  },
                )}
          </span>
        </span>
        <Icon name="chevron-right" size={16} />
      </button>
    </li>
  );
}
