import {
  AnimatedCircleConfig,
  AnimatedSlideBackgroundProps,
} from "@app/types/types";

/**
 * Unified circle background configuration used across all onboarding slides.
 * Only gradient colors change between slides, creating smooth transitions.
 */
export const UNIFIED_CIRCLE_CONFIG: AnimatedCircleConfig[] = [
  {
    position: "bottom-left",
    size: 270,
    color: "rgba(255, 255, 255, 0.25)",
    opacity: 0.9,
    amplitude: 24,
    duration: 4.5,
    offsetX: 18,
    offsetY: 14,
  },
  {
    position: "top-right",
    size: 300,
    color: "rgba(255, 255, 255, 0.2)",
    opacity: 0.9,
    amplitude: 28,
    duration: 4.5,
    delay: 0.5,
    offsetX: 24,
    offsetY: 18,
  },
];

/**
 * Build a light slide background in a slide-specific accent colour: a white
 * hero fading into a pale horizon tint, with the unified sphere geometry
 * glowing in the accent on each sphere's inner edge.
 */
export function createLightSlideBackground(
  accentRgb: [number, number, number],
  horizon: string,
): AnimatedSlideBackgroundProps {
  const [r, g, b] = accentRgb;
  const sphereColors = [
    `linear-gradient(45deg, rgba(${r}, ${g}, ${b}, 0.04), rgba(${r}, ${g}, ${b}, 0.3))`,
    `linear-gradient(225deg, rgba(${r}, ${g}, ${b}, 0.04), rgba(${r}, ${g}, ${b}, 0.26))`,
  ];
  return {
    gradientStops: ["#FFFFFF", horizon],
    circles: UNIFIED_CIRCLE_CONFIG.map((circle, index) => ({
      ...circle,
      color: sphereColors[index],
    })),
    tone: "light",
  };
}

/**
 * Default light slide background: white with a light blue horizon and
 * blue-glow spheres.
 */
export const UNIFIED_LIGHT_BACKGROUND = createLightSlideBackground(
  [37, 99, 235],
  "#DBEAFE",
);
