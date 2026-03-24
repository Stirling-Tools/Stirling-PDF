import React from 'react';
import { createPortal } from 'react-dom';
import { Text, ActionIcon, ScrollArea } from '@mantine/core';
import { CardModalPhase, CARD_MODAL_TIMINGS } from '@app/hooks/useCardModalAnimation';

interface CardExpansionModalProps {
  phase: CardModalPhase;
  cardRect: DOMRect | null;
  textExpanded: boolean;
  onClose: () => void;
  /** Icon shown on the far left of the header */
  icon: React.ReactNode;
  /** Large number shown centred in the header */
  count: number;
  /** Accordion label — singular form */
  labelSingular: string;
  /** Accordion label — plural form */
  labelPlural: string;
  /** Modal body content — only mounted once open */
  children: React.ReactNode;
  /** Footer content */
  footer?: React.ReactNode;
}

const MODAL_W_REM = 56;
const MODAL_H_REM = 38;
const HEADER_H_REM = 3.5;
const MODAL_TOP_FRACTION = 0.12;
const EASING = 'cubic-bezier(0.22,1,0.36,1)';

export function CardExpansionModal({
  phase,
  cardRect,
  textExpanded,
  onClose,
  icon,
  count,
  labelSingular,
  labelPlural,
  children,
  footer,
}: CardExpansionModalProps) {
  if (phase === 'closed' || !cardRect) return null;

  const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const modalW = Math.min(MODAL_W_REM * rootFontSize, window.innerWidth * 0.9);
  const modalH = MODAL_H_REM * rootFontSize;
  const headerH = HEADER_H_REM * rootFontSize;
  const finalLeft = (window.innerWidth - modalW) / 2;
  const finalTop = window.innerHeight * MODAL_TOP_FRACTION;

  const isAtCard = phase === 'entering' || phase === 'closing-header';
  const isAtHeader = phase === 'header-open';

  const cardH = isAtCard ? cardRect.height : isAtHeader ? headerH : modalH;

  const getTransition = () => {
    const s = CARD_MODAL_TIMINGS;
    if (phase === 'header-open') return `top ${s.headerStretch}ms ${EASING}, left ${s.headerStretch}ms ${EASING}, width ${s.headerStretch}ms ${EASING}, height ${s.headerStretch}ms ${EASING}`;
    if (phase === 'open') return `height ${s.bodyDrop}ms ${EASING}`;
    if (phase === 'closing-body') return `height ${s.closeBody}ms ease-in`;
    if (phase === 'closing-header') return `top ${s.closeStretch}ms ${EASING}, left ${s.closeStretch}ms ${EASING}, width ${s.closeStretch}ms ${EASING}, height ${s.closeStretch}ms ${EASING}, opacity ${s.closeStretch}ms ease`;
    return 'none';
  };

  const backdropOpacity = phase === 'entering' || phase === 'closing-header' ? 0 : 1;
  const cardOpacity = phase === 'closing-header' ? 0 : 1;

  const showBody = phase === 'open' || phase === 'closing-body';

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 300 }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.55)',
          opacity: backdropOpacity,
          transition: 'opacity 220ms ease',
          willChange: 'opacity',
        }}
      />

      {/* Animated card */}
      <div
        style={{
          position: 'fixed',
          top: isAtCard ? cardRect.top : finalTop,
          left: isAtCard ? cardRect.left : finalLeft,
          width: isAtCard ? cardRect.width : modalW,
          height: cardH,
          opacity: cardOpacity,
          transition: getTransition(),
          willChange: 'top, left, width, height, opacity',
          borderRadius: 'var(--mantine-radius-md)',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-toolbar)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 1.5rem 3rem rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{
          position: 'relative',
          height: headerH,
          flexShrink: 0,
          borderBottom: '0.0625rem solid var(--border-subtle)',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {/* Far-left icon */}
            <div style={{ position: 'absolute', left: '1rem', display: 'flex', alignItems: 'center' }}>
              {icon}
            </div>

            {/* Centred count + accordion label */}
            <Text component="span" fw={800} style={{ fontSize: '1.375rem', lineHeight: 1, margin: 0 }}>
              {count}
            </Text>
            <div style={{
              maxWidth: textExpanded ? '16rem' : '0',
              opacity: textExpanded ? 1 : 0,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              transition: `max-width 100ms ${EASING}, opacity 80ms ease`,
            }}>
              <Text component="span" c="dimmed" style={{ fontSize: '1rem', paddingLeft: '0.5rem', lineHeight: 1, margin: 0 }}>
                {count === 1 ? labelSingular : labelPlural}
              </Text>
            </div>

            {/* Close button */}
            <ActionIcon
              variant="subtle" size="lg" color="gray"
              onClick={onClose}
              style={{ position: 'absolute', top: '0.25rem', right: '0.375rem' }}
            >
              <Text style={{ fontSize: '1.25rem', lineHeight: 1 }}>×</Text>
            </ActionIcon>
          </div>
        </div>

        {/* Body — only mount once open */}
        {showBody && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, backgroundColor: 'var(--bg-toolbar)' }}>
            <ScrollArea style={{ flex: 1, minHeight: 0 }}>
              <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--bg-toolbar)' }}>
                {children}
              </div>
            </ScrollArea>
            {footer && (
              <div style={{
                padding: '0.75rem 1rem',
                borderTop: '0.0625rem solid var(--border-subtle)',
                flexShrink: 0,
              }}>
                {footer}
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
