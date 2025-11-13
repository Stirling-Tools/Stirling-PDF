import React from 'react';
import SectionBlock from '../shared/SectionBlock';
import KeyValueList from '../shared/KeyValueList';

interface KeyValueSectionProps {
  title: string;
  anchorId: string;
  obj?: Record<string, unknown> | null;
  emptyLabel?: string;
}

const KeyValueSection: React.FC<KeyValueSectionProps> = ({ title, anchorId, obj, emptyLabel }) => {
  return (
    <SectionBlock title={title} anchorId={anchorId}>
      <KeyValueList obj={obj} emptyLabel={emptyLabel} />
    </SectionBlock>
  );
};

export default KeyValueSection;


