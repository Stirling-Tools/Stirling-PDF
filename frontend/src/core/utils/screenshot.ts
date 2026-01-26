import { domToBlob } from 'modern-screenshot';

interface ScreenshotOptions {
  filter?: (node: Node) => boolean;
  width?: number;
  height?: number;
  restoreScrollPosition?: boolean;
}

/**
 * Capture a screenshot of a DOM element as a data URL
 *
 * @param element - The DOM element to capture
 * @returns Promise resolving to an object URL of the screenshot, or null if capture fails
 */
export async function captureElementScreenshot(
  element: HTMLElement,
  options: ScreenshotOptions = {}
): Promise<string | null> {
  try {
    const {
      filter,
      width = window.innerWidth,
      height = window.innerHeight,
      restoreScrollPosition = true,
    } = options;
    const blob = await domToBlob(element, {
      width,
      height,
      style: {
        transform: 'none',
      },
      filter,
      features: { restoreScrollPosition },
    });

    return URL.createObjectURL(blob);
  } catch (error) {
    console.warn('Failed to capture screenshot:', error);
    return null;
  }
}
