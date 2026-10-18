import { useTranslation } from "react-i18next";
import { McpToggleRow } from "@app/components/shared/config/configSections/server/McpToggleRow";
import type { McpBuiltinAuthData } from "@app/components/shared/config/configSections/server/serverSettings";

interface McpBuiltinFieldsProps {
  builtin: McpBuiltinAuthData;
  onChange: (patch: Partial<McpBuiltinAuthData>) => void;
  isFieldPending: (field: string) => boolean;
  disabled: boolean;
}

/** How clients may register with the built-in authorization server. */
export function McpBuiltinFields({
  builtin,
  onChange,
  isFieldPending,
  disabled,
}: McpBuiltinFieldsProps) {
  const { t } = useTranslation();
  return (
    <>
      <McpToggleRow
        label={t(
          "admin.settings.mcp.builtin.dcr.label",
          "Allow dynamic client registration",
        )}
        description={t(
          "admin.settings.mcp.builtin.dcr.description",
          "Lets clients that cannot be pre-registered, such as Claude, register themselves (RFC 7591).",
        )}
        checked={builtin.allowDynamicRegistration ?? true}
        pending={isFieldPending("auth.builtin.allowDynamicRegistration")}
        disabled={disabled}
        onChange={(checked) => onChange({ allowDynamicRegistration: checked })}
      />
      <McpToggleRow
        label={t(
          "admin.settings.mcp.builtin.cimd.label",
          "Allow client metadata URLs",
        )}
        description={t(
          "admin.settings.mcp.builtin.cimd.description",
          "Lets a client such as ChatGPT identify itself with an https client_id URL. Stirling fetches that document (public hosts only) instead of requiring registration.",
        )}
        checked={builtin.allowClientMetadataDocuments ?? true}
        pending={isFieldPending("auth.builtin.allowClientMetadataDocuments")}
        disabled={disabled}
        onChange={(checked) =>
          onChange({ allowClientMetadataDocuments: checked })
        }
      />
    </>
  );
}
