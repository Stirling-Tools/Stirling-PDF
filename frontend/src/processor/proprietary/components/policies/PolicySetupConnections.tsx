import { useEffect, useState } from "react";
import type { PolicySetupConfigProps } from "@app/components/policies/PolicySetupWizard";
import { PolicySetupInput } from "@portal/components/policies/PolicySetupInput";
import { PolicySetupOutput } from "@portal/components/policies/PolicySetupOutput";

interface Props extends PolicySetupConfigProps {
  folderName?: string;
  readOnly?: boolean;
}

/** Combines input and output validation for the shared wizard draft. */
export function PolicySetupConnections({
  result,
  onChange,
  onValidityChange,
  folderName,
  readOnly = false,
}: Props) {
  const [inputValid, setInputValid] = useState(false);
  const [outputValid, setOutputValid] = useState(false);
  useEffect(
    () => onValidityChange(inputValid && outputValid),
    [inputValid, outputValid, onValidityChange],
  );

  return (
    <fieldset disabled={readOnly} className="portal-policies__setup-locations">
      <PolicySetupInput
        result={result}
        onChange={onChange}
        onValidityChange={setInputValid}
        folderName={folderName}
      />
      <PolicySetupOutput
        result={result}
        onChange={onChange}
        onValidityChange={setOutputValid}
        folderName={folderName}
      />
    </fieldset>
  );
}
