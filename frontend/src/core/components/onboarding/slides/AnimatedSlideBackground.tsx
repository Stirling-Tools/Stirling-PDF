import React from 'react';
import styles from '@app/components/onboarding/slides/AnimatedSlideBackground.module.css';
import { AnimatedSlideBackgroundProps } from '@app/types/types';

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
  const [prevGradient, setPrevGradient] = React.useState<[string, string] | null>(null);
  const [currentGradient, setCurrentGradient] = React.useState<[string, string]>(gradientStops);
  const [isTransitioning, setIsTransitioning] = React.useState(false);
  const isFirstMount = React.useRef(true);

  React.useEffect(() => {
    // Skip transition on first mount
    if (isFirstMount.current) {
      isFirstMount.current = false;
      setCurrentGradient(gradientStops);
      return;
    }
    
    // Only transition if gradient actually changed
    if (currentGradient[0] !== gradientStops[0] || currentGradient[1] !== gradientStops[1]) {
      // Store previous gradient and start transition
      setPrevGradient(currentGradient);
      setIsTransitioning(true);
      
      // Update to new gradient (will fade in)
      setCurrentGradient(gradientStops);
    }
  }, [gradientStops]);

  const currentGradientStyle = React.useMemo(
    () => ({
      backgroundImage: `linear-gradient(135deg, ${currentGradient[0]}, ${currentGradient[1]})`,
    }),
    [currentGradient],
  );

  const prevGradientStyle = prevGradient
    ? {
        backgroundImage: `linear-gradient(135deg, ${prevGradient[0]}, ${prevGradient[1]})`,
      }
    : null;

  return (
    <div className={styles.hero} key="animated-background">
      {prevGradientStyle && isTransitioning && (
        <div 
          className={`${styles.gradientLayer} ${styles.gradientLayerPrevFadeOut}`} 
          style={prevGradientStyle}
          onTransitionEnd={() => {
            setPrevGradient(null);
            setIsTransitioning(false);
          }}
        />
      )}
      <div
        className={`${styles.gradientLayer} ${isActive ? styles.gradientLayerActive : ''}`.trim()}
        style={currentGradientStyle}
      />
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
            key={`circle-${index}-${position}`}
            className={styles.circle}
            style={circleStyle}
          />
        );
      })}
    </div>
  );
}
