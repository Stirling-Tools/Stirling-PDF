import React from 'react';
import '@app/components/shared/LandingDocumentStack.css';

const DOC_BG = '#FFFFFF';
const DOC_BORDER = '#E5E7EB';
const DOC_LINE = '#E5E7EB';
const DOC_LINE_DARK = '#D1D5DB';

const DARK_DOC_BG = DOC_BG;
const DARK_DOC_BORDER = DOC_BORDER;
const DARK_DOC_LINE = DOC_LINE;
const DARK_DOC_LINE_DARK = DOC_LINE_DARK;

const SIDE_SHADOW_LIGHT = '0 4px 20px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)';
const SIDE_SHADOW_DARK = '0 4px 20px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.2)';
const CENTER_SHADOW_LIGHT = '0 8px 30px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.02)';
const CENTER_SHADOW_DARK = '0 8px 30px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.2)';

interface Props {
  isDark: boolean;
}

function Line({ width, height, color, mb }: { width: string; height: number; color: string; mb: number }) {
  return <div style={{ width, height, borderRadius: 9999, marginBottom: mb, backgroundColor: color }} />;
}

function SidePageLines({ line, lineDark }: { line: string; lineDark: string }) {
  return (
    <div style={{ padding: 16 }}>
      <Line width="100%" height={10} color={lineDark} mb={12} />
      <Line width="80%" height={8} color={line} mb={8} />
      <Line width="100%" height={8} color={line} mb={8} />
      <Line width="60%" height={8} color={line} mb={0} />
    </div>
  );
}

function CenterPageLines({ line, lineDark }: { line: string; lineDark: string }) {
  return (
    <div style={{ padding: 16 }}>
      <Line width="100%" height={10} color={lineDark} mb={12} />
      <Line width="80%" height={8} color={line} mb={8} />
      <Line width="100%" height={8} color={line} mb={8} />
      <Line width="66%" height={8} color={line} mb={16} />
      <Line width="100%" height={8} color={line} mb={8} />
      <Line width="83%" height={8} color={line} mb={0} />
    </div>
  );
}

function RightPageLines({ line, lineDark }: { line: string; lineDark: string }) {
  return (
    <div style={{ padding: 16 }}>
      <Line width="100%" height={10} color={lineDark} mb={12} />
      <Line width="75%" height={8} color={line} mb={8} />
      <Line width="100%" height={8} color={line} mb={8} />
      <Line width="80%" height={8} color={line} mb={0} />
    </div>
  );
}

export default function LandingDocumentStack({ isDark }: Props) {
  const bg = isDark ? DARK_DOC_BG : DOC_BG;
  const border = isDark ? DARK_DOC_BORDER : DOC_BORDER;
  const sideShadow = isDark ? SIDE_SHADOW_DARK : SIDE_SHADOW_LIGHT;
  const centerShadow = isDark ? CENTER_SHADOW_DARK : CENTER_SHADOW_LIGHT;
  const line = isDark ? DARK_DOC_LINE : DOC_LINE;
  const lineDark = isDark ? DARK_DOC_LINE_DARK : DOC_LINE_DARK;

  return (
    <div style={{ width: 224, height: 176, position: 'relative', margin: '0 auto 48px' }}>
        {/* Ambient glow */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            filter: 'blur(60px)',
            opacity: 0.6,
            background: `radial-gradient(circle, ${isDark ? 'rgba(74,144,226,0.15)' : 'rgba(76,139,245,0.12)'} 0%, transparent 70%)`,
          }}
        />

        {/* Left page */}
        <div
          className="landing-doc-left"
          style={{
            position: 'absolute',
            left: 8,
            top: 12,
            width: 128,
            height: 160,
            borderRadius: 12,
            transformOrigin: 'bottom center',
            backgroundColor: bg,
            border: `1px solid ${border}`,
            boxShadow: sideShadow,
            overflow: 'hidden',
          }}
        >
          <SidePageLines line={line} lineDark={lineDark} />
        </div>

        {/* Center page */}
        <div
          className="landing-doc-center"
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            width: 144,
            height: 176,
            borderRadius: 12,
            zIndex: 10,
            backgroundColor: bg,
            boxShadow: centerShadow,
            overflow: 'hidden',
          }}
        >
          {/* Blue header bar */}
          <div
            style={{
              height: 40,
              borderRadius: '12px 12px 0 0',
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
              gap: 8,
              background: 'linear-gradient(135deg, #4C8BF5 0%, #3A7BE8 100%)',
            }}
          >
            <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.35)' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.25)' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.15)' }} />
          </div>
          <CenterPageLines line={line} lineDark={lineDark} />
        </div>

        {/* Right page */}
        <div
          className="landing-doc-right"
          style={{
            position: 'absolute',
            right: 8,
            top: 12,
            width: 128,
            height: 160,
            borderRadius: 12,
            transformOrigin: 'bottom center',
            backgroundColor: bg,
            border: `1px solid ${border}`,
            boxShadow: sideShadow,
            overflow: 'hidden',
          }}
        >
          <RightPageLines line={line} lineDark={lineDark} />
        </div>
      </div>
  );
}
