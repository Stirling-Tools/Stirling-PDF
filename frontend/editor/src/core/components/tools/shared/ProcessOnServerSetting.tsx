import { Checkbox } from "@mantine/core";
import { useTranslation } from "react-i18next";

interface Props {
  processOnServer: boolean;
  onChange: (processOnServer: boolean) => void;
  disabled?: boolean;
}

/** Where a Rust tool runs: as wasm in the browser, or natively on the server. */
export default function ProcessOnServerSetting({
  processOnServer,
  onChange,
  disabled,
}: Props) {
  const { t } = useTranslation();

  return (
    <Checkbox
      label={t("rustTools.processOnServer", "Process on server")}
      description={t(
        "rustTools.processOnServerDesc",
        "Run the same Rust code natively on the server instead of in your browser",
      )}
      checked={processOnServer}
      onChange={(event) => onChange(event.currentTarget.checked)}
      disabled={disabled}
    />
  );
}
