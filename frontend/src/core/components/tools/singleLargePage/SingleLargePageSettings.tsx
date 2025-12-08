import React from 'react';
import { useTranslation } from 'react-i18next';
import { SingleLargePageParameters } from '@app/hooks/tools/singleLargePage/useSingleLargePageParameters';

interface SingleLargePageSettingsProps {
  parameters: SingleLargePageParameters;
  onParameterChange: <K extends keyof SingleLargePageParameters>(parameter: K, value: SingleLargePageParameters[K]) => void;
  disabled?: boolean;
}

const SingleLargePageSettings: React.FC<SingleLargePageSettingsProps> = (_) => {
  const { t } = useTranslation();

  return (
    <div className="single-large-page-settings">
      <p className="text-muted">
        {t('pdfToSinglePage.description', 'This tool will merge all pages of your PDF into one large single page. The width will remain the same as the original pages, but the height will be the sum of all page heights.')}
      </p>
    </div>
  );
};

export default SingleLargePageSettings;
