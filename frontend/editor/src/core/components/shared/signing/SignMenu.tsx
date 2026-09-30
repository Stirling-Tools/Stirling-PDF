import { useTranslation } from "react-i18next";
import { Dropdown, type DropdownTriggerProps } from "@app/ui/Dropdown";
import { Icon } from "@app/ui/Icon";
import type { QuickNavToolReasons } from "@app/contexts/QuickNavHostContext";
import type { ToolId } from "@app/types/toolId";
import type { SigningIntent } from "@app/utils/pendingSigningIntent";
import { needsSignature, type SigningItem } from "@app/utils/signingItems";
import "@app/components/shared/signing/signing.css";

interface SignMenuProps {
  children: DropdownTriggerProps["children"];
  opened: boolean;
  onClose: () => void;
  onSelect: (tool: ToolId) => void;
  onOpenSigning: (intent: SigningIntent) => void;
  reasons: QuickNavToolReasons;
  badge: number;
  items: SigningItem[];
}

/** The global rail cannot depend on either app's file, authentication or Mantine providers. */
export function SignMenu({
  children,
  opened,
  onClose,
  onSelect,
  onOpenSigning,
  reasons,
  badge,
  items,
}: SignMenuProps) {
  const { t } = useTranslation();
  return (
    <Dropdown.Root
      open={opened}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      align="start"
    >
      <Dropdown.Trigger>{children}</Dropdown.Trigger>
      <Dropdown.Menu
        className="sign-menu"
        width="min(360px, calc(100vw - 24px))"
        autoFocus
      >
        <div className="sign-menu__heading">
          {t("signWorkspace.personalHeading", "Sign a document")}
        </div>
        <Dropdown.Item
          leading={<Icon name="pen-tool" size={18} />}
          disabled={Boolean(reasons.sign)}
          onSelect={() => onSelect("sign")}
        >
          {t("signMenu.personal", "Draw, type or upload a signature")}
        </Dropdown.Item>
        {reasons.sign && <p className="sign-menu__hint">{reasons.sign}</p>}
        <Dropdown.Item
          leading={<Icon name="shield-check" size={18} />}
          disabled={Boolean(reasons.certSign)}
          onSelect={() => onSelect("certSign")}
        >
          {t("signMenu.certificate", "Sign with a certificate")}
        </Dropdown.Item>
        {reasons.certSign && (
          <p className="sign-menu__hint">{reasons.certSign}</p>
        )}
        <Dropdown.Divider />
        <div className="sign-menu__heading">
          {t("signMenu.sessions", "Signing sessions")}
          {badge > 0 && <span className="sign-menu__count">{badge}</span>}
        </div>
        <Dropdown.Item
          leading={<Icon name="plus" size={18} />}
          disabled={Boolean(reasons.sharedSign)}
          onSelect={() => onOpenSigning("create")}
        >
          {t("signMenu.request", "Request signatures")}
        </Dropdown.Item>
        <Dropdown.Item
          leading={<Icon name="maximize-2" size={18} />}
          disabled={Boolean(reasons.sharedSign)}
          onSelect={() => onOpenSigning("list")}
        >
          {t("signWorkspace.expand", "Expand signing sessions")}
        </Dropdown.Item>
        {reasons.sharedSign ? (
          <p className="sign-menu__hint">{reasons.sharedSign}</p>
        ) : items.length > 0 ? (
          <>
            <div className="sign-menu__hint">
              {t("signWorkspace.recent", "Recent activity")}
            </div>
            {items.map((item) => (
              <Dropdown.Item
                key={`${item.kind}-${item.sessionId}`}
                leading={
                  <Icon
                    name={item.kind === "request" ? "pen-tool" : "users"}
                    size={18}
                  />
                }
                onSelect={() =>
                  onOpenSigning({ kind: item.kind, sessionId: item.sessionId })
                }
              >
                <span className="sign-menu__document" title={item.documentName}>
                  {item.documentName}
                </span>{" "}
                <span className="sign-menu__meta">
                  {needsSignature(item)
                    ? t("signWorkspace.needsYou", "Needs your signature")
                    : item.kind === "session"
                      ? t("signWorkspace.yourRequest", "Your request")
                      : t("signWorkspace.submitted", "Response submitted")}
                </span>
              </Dropdown.Item>
            ))}
          </>
        ) : (
          <p className="sign-menu__hint">
            {t(
              "signWorkspace.noRecent",
              "Your active sessions will appear here.",
            )}
          </p>
        )}
      </Dropdown.Menu>
    </Dropdown.Root>
  );
}
