import {
  BoundingBox,
  PdfJsonDocument,
  PdfJsonPage,
  PdfJsonTextElement,
  TextGroup,
  DEFAULT_PAGE_HEIGHT,
  DEFAULT_PAGE_WIDTH,
} from './pdfJsonEditorTypes';

const LINE_TOLERANCE = 2;
const GAP_FACTOR = 0.6;
const SPACE_MIN_GAP = 1.5;

export const valueOr = (value: number | null | undefined, fallback = 0): number => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return fallback;
  }
  return value;
};

export const cloneTextElement = (element: PdfJsonTextElement): PdfJsonTextElement => ({
  ...element,
  textMatrix: element.textMatrix ? [...element.textMatrix] : element.textMatrix ?? undefined,
});

const getBaseline = (element: PdfJsonTextElement): number => {
  if (element.textMatrix && element.textMatrix.length === 6) {
    return valueOr(element.textMatrix[5]);
  }
  return valueOr(element.y);
};

const getX = (element: PdfJsonTextElement): number => {
  if (element.textMatrix && element.textMatrix.length === 6) {
    return valueOr(element.textMatrix[4]);
  }
  return valueOr(element.x);
};

const getWidth = (element: PdfJsonTextElement): number => {
  const width = valueOr(element.width, 0);
  if (width === 0 && element.text) {
    const fontSize = valueOr(element.fontSize, 12);
    return fontSize * Math.max(element.text.length * 0.45, 0.5);
  }
  return width;
};

const getFontSize = (element: PdfJsonTextElement): number => valueOr(element.fontMatrixSize ?? element.fontSize, 12);

const getHeight = (element: PdfJsonTextElement): number => {
  const height = valueOr(element.height);
  if (height === 0) {
    return getFontSize(element) * 1.05;
  }
  return height;
};

const getElementBounds = (element: PdfJsonTextElement): BoundingBox => {
  const left = getX(element);
  const width = getWidth(element);
  const bottom = getBaseline(element);
  const height = getHeight(element);
  const top = bottom - height;
  return {
    left,
    right: left + width,
    top,
    bottom,
  };
};

const mergeBounds = (bounds: BoundingBox[]): BoundingBox => {
  if (bounds.length === 0) {
    return { left: 0, right: 0, top: 0, bottom: 0 };
  }
  return bounds.reduce(
    (acc, current) => ({
      left: Math.min(acc.left, current.left),
      right: Math.max(acc.right, current.right),
      top: Math.min(acc.top, current.top),
      bottom: Math.max(acc.bottom, current.bottom),
    }),
    { ...bounds[0] }
  );
};

const shouldInsertSpace = (prev: PdfJsonTextElement, current: PdfJsonTextElement): boolean => {
  const prevRight = getX(prev) + getWidth(prev);
  const gap = getX(current) - prevRight;
  const avgFontSize = (getFontSize(prev) + getFontSize(current)) / 2;
  const threshold = Math.max(SPACE_MIN_GAP, avgFontSize * GAP_FACTOR);
  return gap > threshold;
};

const buildGroupText = (elements: PdfJsonTextElement[]): string => {
  let result = '';
  elements.forEach((element, index) => {
    const value = element.text ?? '';
    if (index === 0) {
      result += value;
      return;
    }

    const previous = elements[index - 1];
    const needsSpace = shouldInsertSpace(previous, element);
    const startsWithWhitespace = /^\s/u.test(value);

    if (needsSpace && !startsWithWhitespace) {
      result += ' ';
    }
    result += value;
  });
  return result;
};

const createGroup = (
  pageIndex: number,
  idSuffix: number,
  elements: PdfJsonTextElement[],
): TextGroup => {
  const clones = elements.map(cloneTextElement);
  const originalClones = clones.map(cloneTextElement);
  const bounds = mergeBounds(elements.map(getElementBounds));

  return {
    id: `${pageIndex}-${idSuffix}`,
    pageIndex,
    fontId: elements[0]?.fontId,
    fontSize: elements[0]?.fontSize,
    fontMatrixSize: elements[0]?.fontMatrixSize,
    elements: clones,
    originalElements: originalClones,
    text: buildGroupText(elements),
    originalText: buildGroupText(elements),
    bounds,
  };
};

export const groupPageTextElements = (page: PdfJsonPage | null | undefined, pageIndex: number): TextGroup[] => {
  if (!page?.textElements || page.textElements.length === 0) {
    return [];
  }

  const elements = page.textElements
    .map(cloneTextElement)
    .filter((element) => element.text !== null && element.text !== undefined);

  elements.sort((a, b) => getBaseline(b) - getBaseline(a));

  const lines: { baseline: number; elements: PdfJsonTextElement[] }[] = [];

  elements.forEach((element) => {
    const baseline = getBaseline(element);
    const fontSize = getFontSize(element);
    const tolerance = Math.max(LINE_TOLERANCE, fontSize * 0.12);

    const existingLine = lines.find((line) => Math.abs(line.baseline - baseline) <= tolerance);

    if (existingLine) {
      existingLine.elements.push(element);
    } else {
      lines.push({ baseline, elements: [element] });
    }
  });

  lines.forEach((line) => {
    line.elements.sort((a, b) => getX(a) - getX(b));
  });

  let groupCounter = 0;
  const groups: TextGroup[] = [];

  lines.forEach((line) => {
    let currentBucket: PdfJsonTextElement[] = [];

    line.elements.forEach((element) => {
      if (currentBucket.length === 0) {
        currentBucket.push(element);
        return;
      }

      const previous = currentBucket[currentBucket.length - 1];
      const gap = getX(element) - (getX(previous) + getWidth(previous));
      const avgFontSize = (getFontSize(previous) + getFontSize(element)) / 2;
      const splitThreshold = Math.max(SPACE_MIN_GAP, avgFontSize * GAP_FACTOR);

      const sameFont = previous.fontId === element.fontId;
      const shouldSplit = gap > splitThreshold * (sameFont ? 1.4 : 1.0);

      if (shouldSplit) {
        groups.push(createGroup(pageIndex, groupCounter, currentBucket));
        groupCounter += 1;
        currentBucket = [element];
      } else {
        currentBucket.push(element);
      }
    });

    if (currentBucket.length > 0) {
      groups.push(createGroup(pageIndex, groupCounter, currentBucket));
      groupCounter += 1;
    }
  });

  return groups;
};

export const groupDocumentText = (document: PdfJsonDocument | null | undefined): TextGroup[][] => {
  const pages = document?.pages ?? [];
  return pages.map((page, index) => groupPageTextElements(page, index));
};

export const deepCloneDocument = (document: PdfJsonDocument): PdfJsonDocument => {
  if (typeof structuredClone === 'function') {
    return structuredClone(document);
  }
  return JSON.parse(JSON.stringify(document));
};

export const pageDimensions = (page: PdfJsonPage | null | undefined): { width: number; height: number } => {
  return {
    width: valueOr(page?.width, DEFAULT_PAGE_WIDTH),
    height: valueOr(page?.height, DEFAULT_PAGE_HEIGHT),
  };
};

export const createMergedElement = (group: TextGroup): PdfJsonTextElement => {
  const reference = group.originalElements[0];
  const merged = cloneTextElement(reference);
  merged.text = group.text;
  if (reference.textMatrix && reference.textMatrix.length === 6) {
    merged.textMatrix = [...reference.textMatrix];
  }
  return merged;
};

const distributeTextAcrossElements = (text: string | undefined, elements: PdfJsonTextElement[]): void => {
  if (elements.length === 0) {
    return;
  }

  const targetChars = Array.from(text ?? '');
  let cursor = 0;

  elements.forEach((element, index) => {
    const originalText = element.text ?? '';
    let sliceLength = Array.from(originalText).length;
    if (sliceLength <= 0) {
      sliceLength = 1;
    }

    if (index === elements.length - 1) {
      element.text = targetChars.slice(cursor).join('');
      cursor = targetChars.length;
      return;
    }

    const slice = targetChars.slice(cursor, cursor + sliceLength).join('');
    element.text = slice;
    cursor = Math.min(cursor + sliceLength, targetChars.length);
  });

  if (cursor < targetChars.length) {
    const last = elements[elements.length - 1];
    last.text = (last.text ?? '') + targetChars.slice(cursor).join('');
  }

  elements.forEach((element) => {
    if (element.text == null) {
      element.text = '';
    }
  });
};

export const buildUpdatedDocument = (
  source: PdfJsonDocument,
  groupsByPage: TextGroup[][],
): PdfJsonDocument => {
  const updated = deepCloneDocument(source);
  const pages = updated.pages ?? [];

  updated.pages = pages.map((page, pageIndex) => {
    const groups = groupsByPage[pageIndex] ?? [];
    if (!groups.length) {
      return page;
    }

    const updatedElements: PdfJsonTextElement[] = groups.flatMap((group) => {
      if (group.text === group.originalText) {
        return group.originalElements.map(cloneTextElement);
      }
      return [createMergedElement(group)];
    });

    return {
      ...page,
      textElements: updatedElements,
      contentStreams: page.contentStreams ?? [],
    };
  });

  return updated;
};

export const restoreGlyphElements = (
  source: PdfJsonDocument,
  groupsByPage: TextGroup[][],
): PdfJsonDocument => {
  const updated = deepCloneDocument(source);
  const pages = updated.pages ?? [];

  updated.pages = pages.map((page, pageIndex) => {
    const groups = groupsByPage[pageIndex] ?? [];
    if (!groups.length) {
      return page;
    }

    const rebuiltElements: PdfJsonTextElement[] = [];

    groups.forEach((group) => {
      const originals = group.originalElements.map(cloneTextElement);
      if (group.text !== group.originalText) {
        distributeTextAcrossElements(group.text, originals);
      }
      rebuiltElements.push(...originals);
    });

    return {
      ...page,
      textElements: rebuiltElements,
      contentStreams: page.contentStreams ?? [],
    };
  });

  return updated;
};

export const getDirtyPages = (groupsByPage: TextGroup[][]): boolean[] => {
  return groupsByPage.map((groups) => groups.some((group) => group.text !== group.originalText));
};
