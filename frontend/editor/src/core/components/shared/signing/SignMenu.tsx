import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { Dropdown, type DropdownTriggerProps } from "@app/ui/Dropdown";
import type { ToolId } from "@app/types/toolId";

interface SignMenuProps {
  children: DropdownTriggerProps["children"];
  opened: boolean;
  onClose: () => void;
  onSelect: (tool: ToolId, create?: boolean) => void;
  reasons: Partial<Record<ToolId, string>>;
  badge: number;
}

/** The global rail cannot depend on either app's file, authentication or Mantine providers. */
export function SignMenu({
  children,
  opened,
  onClose,
  onSelect,
  reasons,
  badge,
}: SignMenuProps): ReactElement {
  const { t } = useTranslation();
  const choose = (tool: ToolId, create = false) => {
    onClose();
    onSelect(tool, create);
  };
  const reason = (tool: ToolId) =>
    reasons[tool] && (
      <small
        style={{ padding: "0.25rem 0.5rem", color: "var(--c-text-muted)" }}
      >
        {reasons[tool]}
      </small>
    );
  return (
    <Dropdown.Root
      open={opened}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      align="start"
    >
      <Dropdown.Trigger>{children}</Dropdown.Trigger>
      <Dropdown.Menu width="min(320px, calc(100vw - 24px))" autoFocus>
        <Dropdown.Item
          disabled={Boolean(reasons.sign)}
          onSelect={() => choose("sign")}
        >
          {t("signMenu.personal", "Draw, type or upload a signature")}
        </Dropdown.Item>
        {reason("sign")}
        <Dropdown.Item
          disabled={Boolean(reasons.certSign)}
          onSelect={() => choose("certSign")}
        >
          {t("signMenu.certificate", "Sign with a certificate")}
        </Dropdown.Item>
        {reason("certSign")}
        <Dropdown.Divider />
        <Dropdown.Item
          disabled={Boolean(reasons.sharedSign)}
          onSelect={() => choose("sharedSign", true)}
        >
          {t("signMenu.request", "Request signatures")}
        </Dropdown.Item>
        <Dropdown.Item
          disabled={Boolean(reasons.sharedSign)}
          onSelect={() => choose("sharedSign")}
          trailing={badge > 0 ? badge : undefined}
        >
          {t("signMenu.sessions", "Signing sessions")}
        </Dropdown.Item>
        {reason("sharedSign")}
      </Dropdown.Menu>
    </Dropdown.Root>
  );
}
