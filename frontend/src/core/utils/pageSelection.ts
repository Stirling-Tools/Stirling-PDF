export const validatePageNumbers = (pageNumbers: string): boolean => {
  if (!pageNumbers.trim()) return false;

  // Normalize input for validation: remove spaces around commas and other spaces
  const normalized = pageNumbers.replace(/\s*,\s*/g, ',').replace(/\s+/g, '');
  const parts = normalized.split(',');

  // Regular expressions for different page number formats
  const allToken = /^all$/i; // Select all pages
  const singlePageRegex = /^[1-9]\d*$/; // Single page: positive integers only (no 0)
  const rangeRegex = /^[1-9]\d*-(?:[1-9]\d*)?$/; // Range: 1-5 or open range 10-
  const mathRegex = /^(?=.*n)[0-9n+\-*/() ]+$/; // Mathematical expressions with n and allowed chars

  return parts.every(part => {
    if (!part) return false;
    return (
      allToken.test(part) ||
      singlePageRegex.test(part) ||
      rangeRegex.test(part) ||
      mathRegex.test(part)
    );
  });
};
