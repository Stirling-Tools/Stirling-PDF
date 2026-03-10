import React from 'react';
import '@app/components/shared/LandingDocumentStack.css';

interface Props {
  isDark: boolean;
}

function Line({
  width,
  height,
  mb,
  className,
}: {
  width: string;
  height: number;
  mb: number;
  className: string;
}) {
  return (
    <div
      className={className}
      style={{ width, height, marginBottom: mb }}
    />
  );
}

function SidePageLines() {
  return (
    <div className="landing-doc-stack__lines-inner">
      <Line width="100%" height={10} mb={12} className="landing-doc-stack__line landing-doc-stack__line--dark" />
      <Line width="80%" height={8} mb={8} className="landing-doc-stack__line" />
      <Line width="100%" height={8} mb={8} className="landing-doc-stack__line" />
      <Line width="60%" height={8} mb={0} className="landing-doc-stack__line" />
    </div>
  );
}

function CenterPageLines() {
  return (
    <div className="landing-doc-stack__lines-inner">
      <Line width="100%" height={10} mb={12} className="landing-doc-stack__line landing-doc-stack__line--dark" />
      <Line width="80%" height={8} mb={8} className="landing-doc-stack__line" />
      <Line width="100%" height={8} mb={8} className="landing-doc-stack__line" />
      <Line width="66%" height={8} mb={16} className="landing-doc-stack__line" />
      <Line width="100%" height={8} mb={8} className="landing-doc-stack__line" />
      <Line width="83%" height={8} mb={0} className="landing-doc-stack__line" />
    </div>
  );
}

function RightPageLines() {
  return (
    <div className="landing-doc-stack__lines-inner">
      <Line width="100%" height={10} mb={12} className="landing-doc-stack__line landing-doc-stack__line--dark" />
      <Line width="75%" height={8} mb={8} className="landing-doc-stack__line" />
      <Line width="100%" height={8} mb={8} className="landing-doc-stack__line" />
      <Line width="80%" height={8} mb={0} className="landing-doc-stack__line" />
    </div>
  );
}

export default function LandingDocumentStack({ isDark }: Props) {
  return (
    <div className={`landing-doc-stack ${isDark ? 'landing-doc-stack--dark' : ''}`}>
      <div className="landing-doc-stack__container">
        <div className={`landing-doc-stack__glow ${isDark ? 'landing-doc-stack__glow--dark' : 'landing-doc-stack__glow--light'}`} />

        <div className="landing-doc-left">
          <SidePageLines />
        </div>

        <div className="landing-doc-center">
          <div className="landing-doc-stack__header-bar">
            <div className="landing-doc-stack__header-dot" />
            <div className="landing-doc-stack__header-dot" />
            <div className="landing-doc-stack__header-dot" />
          </div>
          <CenterPageLines />
        </div>

        <div className="landing-doc-right">
          <RightPageLines />
        </div>
      </div>
    </div>
  );
}
