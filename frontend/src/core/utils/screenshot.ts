import { domToPng } from 'modern-screenshot';

/**
 * Capture a screenshot of a DOM element as a data URL
 *
 * @param element - The DOM element to capture
 * @returns Promise resolving to a data URL of the screenshot, or null if capture fails
 */
export async function captureElementScreenshot(element: HTMLElement): Promise<string | null> {
  try {
    const dataUrl = await domToPng(element, {
      width: window.innerWidth,
      height: window.innerHeight,
      style: {
        transform: 'none',
      },
    });

    return dataUrl;
  } catch (error) {
    console.warn('Failed to capture screenshot:', error);
    return null;
  }
}
