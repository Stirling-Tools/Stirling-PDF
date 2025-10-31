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

const normalizeToken = (token: string) => token.trim().toLowerCase();

const RANGE_REGEX = /^(\d+)-(\d+)$/;
const OPEN_RANGE_REGEX = /^(\d+)-$/;

export const resolvePageNumbers = (
  rawInput: string,
  totalPages: number
): number[] | null => {
  if (!rawInput.trim()) return [];

  const normalized = rawInput.replace(/\s+/g, '');
  const parts = normalized.split(',').filter(Boolean);
  if (parts.length === 0) return [];

  const selected = new Set<number>();

  for (const part of parts) {
    const token = normalizeToken(part);
    if (token.includes('n')) {
      return null;
    }

    if (token === 'all') {
      for (let i = 0; i < totalPages; i += 1) {
        selected.add(i);
      }
      continue;
    }

    if (/^\d+$/.test(token)) {
      const pageIndex = parseInt(token, 10) - 1;
      if (Number.isFinite(pageIndex) && pageIndex >= 0 && pageIndex < totalPages) {
        selected.add(pageIndex);
      }
      continue;
    }

    const rangeMatch = token.match(RANGE_REGEX);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (end < start) {
        return null;
      }
      for (let page = start; page <= end && page <= totalPages; page += 1) {
        selected.add(page - 1);
      }
      continue;
    }

    const openRangeMatch = token.match(OPEN_RANGE_REGEX);
    if (openRangeMatch) {
      const start = parseInt(openRangeMatch[1], 10);
      for (let page = start; page <= totalPages; page += 1) {
        selected.add(page - 1);
      }
      continue;
    }

    return null;
  }

  return Array.from(selected).sort((a, b) => a - b);
};

export const resolvePageOrderSequence = (
  rawInput: string,
  totalPages: number
): number[] | null => {
  if (!rawInput.trim()) return [];

  const parts = rawInput.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length === 0) return [];

  const order: number[] = [];

  for (const part of parts) {
    const token = part.toLowerCase();
    if (token.includes('n')) {
      return null;
    }

    if (token === 'all') {
      for (let i = 0; i < totalPages; i += 1) {
        order.push(i);
      }
      continue;
    }

    if (/^\d+$/.test(token)) {
      const idx = parseInt(token, 10) - 1;
      if (idx >= 0 && idx < totalPages) {
        order.push(idx);
      }
      continue;
    }

    const rangeMatch = token.match(RANGE_REGEX);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (end < start) return null;
      for (let page = start; page <= end && page <= totalPages; page += 1) {
        order.push(page - 1);
      }
      continue;
    }

    const openRangeMatch = token.match(OPEN_RANGE_REGEX);
    if (openRangeMatch) {
      const start = parseInt(openRangeMatch[1], 10);
      for (let page = start; page <= totalPages; page += 1) {
        order.push(page - 1);
      }
      continue;
    }

    return null;
  }

  return order;
};
