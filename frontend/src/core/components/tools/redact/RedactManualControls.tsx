import { Stack } from '@mantine/core';
import ButtonSelector from '@app/components/shared/ButtonSelector';
import React, { useEffect, useState } from 'react';

export type ManualRedactionType = 'redactSelection' | 'marqueeRedact';

interface Props {
  value: ManualRedactionType;          // reflect current plugin state if you like
  onChange?: (v: ManualRedactionType) => void;
  disabled?: boolean;
}

const LS_KEY = 'redaction:lastChoice';

export default function RedactManualControls({ value, onChange, disabled = false }: Props) {
  const [internal, setInternal] = useState<ManualRedactionType>(value);

  useEffect(() => {
    if (value && value !== internal) setInternal(value);
  }, [value]); // keep UI in sync

  const apply = (v: ManualRedactionType) => {
    localStorage.setItem(LS_KEY, v);  
    (document as any)._embedpdf_redactMode = v;
    setInternal(v);
    onChange?.(v);
    // tell the bridge immediately
    const epdf = (window as any).__EMBEDPDF__?.bridges?.redaction;
    const apiBridge = epdf?.apiBridge;
    apiBridge?.setLastClicked?.(v);
    apiBridge?.setMode?.(v);
  };

  return (
    <Stack gap="var(--mantine-spacing-sm)">
      <ButtonSelector
        label="Manual Redaction"
        value={internal}
        onChange={apply}
        options={[
          { value: 'redactSelection', label: 'Redact by Text' },
          { value: 'marqueeRedact',  label: 'Redact by Area' },
        ]}
        disabled={disabled}
      />
    </Stack>
  );
}
