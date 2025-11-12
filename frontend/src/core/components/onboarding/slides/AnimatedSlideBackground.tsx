import React from 'react';
import styles from './AnimatedSlideBackground.module.css';
import { AnimatedSlideBackgroundProps } from './types';

type CircleStyles = React.CSSProperties & {
  '--circle-move-x'?: string;
  '--circle-move-y'?: string;
  '--circle-duration'?: string;
  '--circle-delay'?: string;
};

interface AnimatedSlideBackgroundComponentProps extends AnimatedSlideBackgroundProps {
  isActive: boolean;
  slideKey: string;
}

export default function AnimatedSlideBackground({
  gradientStops,
  circles,
  isActive,
  slideKey,
}: AnimatedSlideBackgroundComponentProps) {
  const gradientStyle = React.useMemo(
    () => ({
      backgroundImage: `linear-gradient(135deg, ${gradientStops[0]}, ${gradientStops[1]})`,
    }),
    [gradientStops],
  );

  return (
    <div
      className={`${styles.hero} ${isActive ? styles.heroActive : ''}`.trim()}
      style={gradientStyle}
      key={slideKey}
    >
      {circles.map((circle, index) => {
        const { position, size, color, opacity, blur, amplitude = 48, duration = 15, delay = 0 } = circle;

        const moveX = position === 'bottom-left' ? amplitude : -amplitude;
        const moveY = position === 'bottom-left' ? -amplitude * 0.6 : amplitude * 0.6;

        const circleStyle: CircleStyles = {
          width: size,
          height: size,
          background: color,
          opacity: opacity ?? 0.9,
          filter: blur ? `blur(${blur}px)` : undefined,
          '--circle-move-x': `${moveX}px`,
          '--circle-move-y': `${moveY}px`,
          '--circle-duration': `${duration}s`,
          '--circle-delay': `${delay}s`,
        };

        const defaultOffset = -size / 2;
        const offsetX = circle.offsetX ?? 0;
        const offsetY = circle.offsetY ?? 0;

        if (position === 'bottom-left') {
          circleStyle.left = `${defaultOffset + offsetX}px`;
          circleStyle.bottom = `${defaultOffset + offsetY}px`;
        } else {
          circleStyle.right = `${defaultOffset + offsetX}px`;
          circleStyle.top = `${defaultOffset + offsetY}px`;
        }

        return (
          <div
            key={`${slideKey}-circle-${index}`}
            className={styles.circle}
            style={circleStyle}
          />
        );
      })}
    </div>
  );
}
