import html2canvas from 'html2canvas';

/**
 * Capture a screenshot of a DOM element as a data URL
 *
 * @param element - The DOM element to capture
 * @returns Promise resolving to a data URL of the screenshot, or null if capture fails
 */
export async function captureElementScreenshot(element: HTMLElement): Promise<string | null> {
  try {
    const canvas = await html2canvas(element, {
      backgroundColor: null,
      scale: 1,
      logging: false,
      useCORS: true,
      width: window.innerWidth,
      height: window.innerHeight,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      x: 0,
      y: 0,
    });

    return canvas.toDataURL('image/png');
  } catch (error) {
    console.warn('Failed to capture screenshot:', error);
    return null;
  }
}
