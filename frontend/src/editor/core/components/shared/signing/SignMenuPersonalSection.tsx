import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "@app/ui/Icon";
import type { QuickNavToolReasons } from "@app/contexts/QuickNavHostContext";
import type { ToolId } from "@app/types/toolId";

interface SignToolButtonProps {
  icon: IconName;
  title: string;
  hint: string;
  unavailableReason?: string;
  onClick: () => void;
}

function SignToolButton({
  icon,
  title,
  hint,
  unavailableReason,
  onClick,
}: SignToolButtonProps) {
  return (
    <button
      type="button"
      className="sign-menu__tool"
      disabled={Boolean(unavailableReason)}
      onClick={onClick}
      title={unavailableReason}
    >
      <Icon name={icon} size={20} />
      <strong>{title}</strong>
      <span>{hint}</span>
    </button>
  );
}

interface SignMenuPersonalSectionProps {
  reasons: QuickNavToolReasons;
  onSelectTool: (tool: ToolId) => void;
}

export function SignMenuPersonalSection({
  reasons,
  onSelectTool,
}: SignMenuPersonalSectionProps) {
  const { t } = useTranslation();
  const unavailable = [
    ...new Set([reasons.sign, reasons.certSign].filter(Boolean)),
  ];
  return (
    <section
      className="sign-menu__personal"
      aria-label={t("signWorkspace.personalHeading", "Sign a document")}
    >
      <h2>{t("signWorkspace.personalHeading", "Sign a document")}</h2>
      <div className="sign-menu__tools">
        <SignToolButton
          icon="pen-tool"
          title={t("signMenu.personalTitle", "Personal signature")}
          hint={t("signMenu.personalHint", "Draw, type or upload")}
          unavailableReason={reasons.sign}
          onClick={() => onSelectTool("sign")}
        />
        <SignToolButton
          icon="shield-check"
          title={t("signMenu.certificateTitle", "Digital signature")}
          hint={t("signMenu.certificateHint", "Use a certificate")}
          unavailableReason={reasons.certSign}
          onClick={() => onSelectTool("certSign")}
        />
      </div>
      {unavailable.length > 0 && (
        <p className="sign-menu__hint">{unavailable.join(" · ")}</p>
      )}
    </section>
  );
}
