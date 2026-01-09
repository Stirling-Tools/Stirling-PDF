/**
 * DOM utility functions
 */

/**
 * Find a thumbnail image inside a file card element and return its bounding rect
 * Falls back to the card's own rect if no image is found
 *
 * @param cardElement - The file card element to search within
 * @returns The bounding rect of the thumbnail image, or the card itself if no image found
 */
export function getThumbnailRect(cardElement: Element): DOMRect {
  const thumbnailImg = cardElement.querySelector('img') as HTMLImageElement;
  return thumbnailImg
    ? thumbnailImg.getBoundingClientRect()
    : cardElement.getBoundingClientRect();
}

/**
 * Returns a centered fallback rectangle for animations when a DOM element is missing.
 */
export function getCenteredFallbackRect(): DOMRect {
  const width = 200;
  const height = 260;
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  return new DOMRect(centerX - width / 2, centerY - height / 2, width, height);
}
