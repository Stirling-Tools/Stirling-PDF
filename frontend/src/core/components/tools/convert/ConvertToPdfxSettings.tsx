import { useEffect } from 'react';
import { ConvertParameters } from '@app/hooks/tools/convert/useConvertParameters';
import { StirlingFile } from '@app/types/fileContext';

interface ConvertToPdfxSettingsProps {
  parameters: ConvertParameters;
  onParameterChange: <K extends keyof ConvertParameters>(key: K, value: ConvertParameters[K]) => void;
  selectedFiles: StirlingFile[];
  disabled?: boolean;
}

const ConvertToPdfxSettings = ({
  parameters,
  onParameterChange,
  selectedFiles: _selectedFiles,
  disabled: _disabled = false
}: ConvertToPdfxSettingsProps) => {
  // Automatically set PDF/X-3 format when this component is rendered
  useEffect(() => {
    if (parameters.pdfxOptions.outputFormat !== 'pdfx-3') {
      onParameterChange('pdfxOptions', {
        ...parameters.pdfxOptions,
        outputFormat: 'pdfx-3'
      });
    }
  }, [parameters.pdfxOptions.outputFormat, onParameterChange]);

  return null;
};

export default ConvertToPdfxSettings;
