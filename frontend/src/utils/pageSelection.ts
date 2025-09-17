export const validatePageNumbers = (pageNumbers: string): boolean => {
  if (!pageNumbers.trim()) return false;

  // Normalize input for validation: remove spaces around commas and other spaces
  const normalized = pageNumbers.replace(/\s*,\s*/g, ',').replace(/\s+/g, '');
  const parts = normalized.split(',');

  // Regular expressions for different page number formats
  const singlePageRegex = /^\d+$/; // Single page: 1, 2, 3, etc.
  const rangeRegex = /^\d+-\d*$/; // Range: 1-5, 10-, etc.
  const negativeRegex = /^-\d+$/; // Negative: -3 (last 3 pages)
  const mathRegex = /^\d*[n]\d*[+\-*/]\d+$/; // Mathematical: 2n+1, n-1, etc.

  return parts.every(part => {
    if (!part) return false;
    return (
      singlePageRegex.test(part) ||
      rangeRegex.test(part) ||
      negativeRegex.test(part) ||
      mathRegex.test(part)
    );
  });
};


