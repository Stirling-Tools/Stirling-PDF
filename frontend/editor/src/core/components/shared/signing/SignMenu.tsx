import { useTranslation } from "react-i18next";
import { useLocalProcessingOnly } from "@app/hooks/useLocalProcessingOnly";
import { Dropdown, type DropdownTriggerProps } from "@app/ui/Dropdown";
import type { QuickNavToolReasons } from "@app/contexts/QuickNavHostContext";
import type { ToolId } from "@app/types/toolId";
import type { SigningIntent } from "@app/utils/pendingSigningIntent";
import type { SigningMenuItem } from "@app/utils/signingItems";
import { SignMenuPersonalSection } from "@app/components/shared/signing/SignMenuPersonalSection";
import { SignMenuSessionsSection } from "@app/components/shared/signing/SignMenuSessionsSection";
import { useSignMenuSessions } from "@app/components/shared/signing/useSignMenuSessions";
import "@app/components/shared/signing/signing.css";

interface SignMenuProps {
  children: DropdownTriggerProps["children"];
  opened: boolean;
  onClose: () => void;
  onSelect: (tool: ToolId) => void;
  onOpenSigning: (intent: SigningIntent) => void;
  reasons: QuickNavToolReasons;
  items: SigningMenuItem[];
}

/** The global rail cannot depend on either app's file, authentication or Mantine providers. */
export function SignMenu({
  children,
  opened,
  onClose,
  onSelect,
  onOpenSigning,
  reasons,
  items,
}: SignMenuProps) {
  const { t } = useTranslation();
  const localOnly = useLocalProcessingOnly();
  const sessions = useSignMenuSessions(items, opened);
  const openSigning = (intent: SigningIntent) => {
    onClose();
    onOpenSigning(intent);
  };
  const selectTool = (tool: ToolId) => {
    onClose();
    onSelect(tool);
  };

  return (
    <Dropdown.Root
      open={opened}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      align="start"
    >
      <Dropdown.Trigger popupRole="dialog">{children}</Dropdown.Trigger>
      <Dropdown.Menu
        className={`sign-menu${reasons.sharedSign ? " sign-menu--unavailable" : ""}`}
        width="min(400px, calc(100vw - 24px))"
        autoFocus
        role="dialog"
        ariaLabel={t("signMenu.title", "Sign")}
        placement="side"
      >
        <SignMenuPersonalSection reasons={reasons} onSelectTool={selectTool} />
        {!localOnly && (
          <SignMenuSessionsSection
            sessions={sessions}
            unavailableReason={reasons.sharedSign}
            onOpenSigning={openSigning}
          />
        )}
      </Dropdown.Menu>
    </Dropdown.Root>
  );
}
