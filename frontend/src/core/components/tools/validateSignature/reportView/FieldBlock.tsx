import React from 'react';
import { Text } from '@mantine/core';
import '@app/components/tools/validateSignature/reportView/styles.css';

const FieldBlock = (label: string, value: React.ReactNode) => {
  const displayValue =
    value === null || value === undefined || value === '' ? '-' : value;

  return (
    <div className="field-container" key={label}>
      <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: 0.6 }}>
        {label}
      </Text>
      <div className="field-value">
        <Text size="sm" fw={500} style={{ lineHeight: 1.35, whiteSpace: 'pre-wrap' }}>
          {displayValue}
        </Text>
      </div>
    </div>
  );
};

export default FieldBlock;
