/**
 * AddPageNumbersAutomationSettings - the tool's settings for an automation
 * step, without a file to preview.
 */

import { AddPageNumbersParameters } from "@editor/components/tools/addPageNumbers/useAddPageNumbersParameters";
import AddPageNumbersSettings from "@editor/components/tools/addPageNumbers/AddPageNumbersSettings";

interface AddPageNumbersAutomationSettingsProps {
  parameters: AddPageNumbersParameters;
  onParameterChange: <K extends keyof AddPageNumbersParameters>(
    key: K,
    value: AddPageNumbersParameters[K],
  ) => void;
  disabled?: boolean;
}

const AddPageNumbersAutomationSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: AddPageNumbersAutomationSettingsProps) => (
  <AddPageNumbersSettings
    parameters={parameters}
    onParameterChange={onParameterChange}
    disabled={disabled}
  />
);

export default AddPageNumbersAutomationSettings;
