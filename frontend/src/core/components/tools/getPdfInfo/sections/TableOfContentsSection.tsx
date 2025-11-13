import React from 'react';
import SectionBlock from '../shared/SectionBlock';
import SimpleArrayList from '../shared/SimpleArrayList';
import { useTranslation } from 'react-i18next';

interface TableOfContentsSectionProps {
  anchorId: string;
  tocArray: any[];
}

const TableOfContentsSection: React.FC<TableOfContentsSectionProps> = ({ anchorId, tocArray }) => {
  const { t } = useTranslation();
  return (
    <SectionBlock title={t('getPdfInfo.sections.tableOfContents', 'Table of Contents')} anchorId={anchorId}>
      <SimpleArrayList arr={Array.isArray(tocArray) ? tocArray : []} />
    </SectionBlock>
  );
};

export default TableOfContentsSection;


