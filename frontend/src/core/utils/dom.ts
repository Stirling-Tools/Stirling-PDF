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

/**
 * Calculate the actual rendered image rect for an img element with objectFit: contain
 * Accounts for letterboxing/pillarboxing when aspect ratios don't match
 *
 * @param img - The image element with objectFit: contain
 * @returns The bounding rect of the actual rendered image (excluding empty space)
 */
export function getContainedImageRect(img: HTMLImageElement): DOMRect {
  const imgRect = img.getBoundingClientRect();

  // If image hasn't loaded yet, return the full rect
  if (!img.naturalWidth || !img.naturalHeight) {
    return imgRect;
  }

  const naturalRatio = img.naturalWidth / img.naturalHeight;
  const displayRatio = imgRect.width / imgRect.height;

  let actualWidth, actualHeight, offsetX, offsetY;

  if (naturalRatio > displayRatio) {
    // Image is wider - constrained by width (letterboxed top/bottom)
    actualWidth = imgRect.width;
    actualHeight = imgRect.width / naturalRatio;
    offsetX = 0;
    offsetY = (imgRect.height - actualHeight) / 2;
  } else {
    // Image is taller - constrained by height (pillarboxed left/right)
    actualHeight = imgRect.height;
    actualWidth = imgRect.height * naturalRatio;
    offsetX = (imgRect.width - actualWidth) / 2;
    offsetY = 0;
  }

  return new DOMRect(
    imgRect.left + offsetX,
    imgRect.top + offsetY,
    actualWidth,
    actualHeight
  );
}
