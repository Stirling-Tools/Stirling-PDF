import React from 'react';
import { TooltipData } from '@app/types/charts';

interface StackedBarTooltipProps {
  data: TooltipData;
}

export default function StackedBarTooltip({ data }: StackedBarTooltipProps) {
  const { fractions } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', whiteSpace: 'nowrap' }}>
      {fractions.map((f, index) => (
        <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ 
            display: 'inline-block', 
            width: '10px', 
            height: '10px', 
            background: f.color, 
            borderRadius: '2px' 
          }}></span>
          <span>
            <strong>{f.name}</strong> — {f.numeratorLabel}: {f.numerator} · {f.denominatorLabel}: {f.denominator - f.numerator}
          </span>
        </div>
      ))}
    </div>
  );
}

