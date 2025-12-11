importScripts('./diff.js');

let complexMessage = 'One or both of the provided documents are large files, accuracy of comparison may be reduced';
let largeFilesMessage = 'One or Both of the provided documents are too large to process';

// Early: Listener for SET messages (before onmessage)
self.addEventListener('message', (event) => {
  if (event.data.type === 'SET_COMPLEX_MESSAGE') {
    complexMessage = event.data.message;
  } else if (event.data.type === 'SET_TOO_LARGE_MESSAGE') {
    largeFilesMessage = event.data.message;
  }
});

self.onmessage = async function (e) {
  const data = e.data;
  if (data.type !== 'COMPARE') {
    console.log('Worker ignored non-COMPARE message');
    return;
  }

  const { text1, text2, color1, color2 } = data;
  console.log('Received text for comparison:', { lengths: { text1: text1.length, text2: text2.length } }); // Safe Log

  const startTime = performance.now();

  // Safe Trim
  if (!text1 || !text2 || text1.trim() === "" || text2.trim() === "") {
    self.postMessage({ status: 'error', message: 'One or both of the texts are empty.' });
    return;
  }

  // Robust Word-Split (handles spaces/punctuation better)
  const words1 = text1.trim().split(/\s+/).filter(w => w.length > 0);
  const words2 = text2.trim().split(/\s+/).filter(w => w.length > 0);

  const MAX_WORD_COUNT = 150000;
  const COMPLEX_WORD_COUNT = 50000;
  const BATCH_SIZE = 5000; // Define a suitable batch size for processing
  const OVERLAP_SIZE = 200;  // Number of words to overlap - bigger increases accuracy but affects performance

  const isComplex = words1.length > COMPLEX_WORD_COUNT || words2.length > COMPLEX_WORD_COUNT;
  const isTooLarge = words1.length > MAX_WORD_COUNT || words2.length > MAX_WORD_COUNT;

  if (isTooLarge) {
    self.postMessage({ status: 'error', message: largeFilesMessage });
    return;
  }

  if (isComplex) {
    self.postMessage({ status: 'warning', message: complexMessage });
  }

  // Diff based on size
  let differences;
  if (isComplex) {
    differences = await staggeredBatchDiff(words1, words2, color1 || '#ff0000', color2 || '#008000', BATCH_SIZE, OVERLAP_SIZE);
  } else {
    differences = diff(words1, words2, color1 || '#ff0000', color2 || '#008000');
  }

  console.log(`Diff took ${performance.now() - startTime} ms for ${words1.length + words2.length} words`);
  self.postMessage({ status: 'success', differences });
};

// Splits text into smaller batches to run through diff checking algorithms. overlaps the batches to help ensure
async function staggeredBatchDiff(words1, words2, color1, color2, batchSize, overlapSize) {
  const differences = [];
  const totalWords1 = words1.length;
  const totalWords2 = words2.length;

  let previousEnd1 = 0; // Track where the last batch ended in words1
  let previousEnd2 = 0; // Track where the last batch ended in words2

  // Track processed indices to dedupe overlaps
  const processed1 = new Set();
  const processed2 = new Set();

  while (previousEnd1 < totalWords1 || previousEnd2 < totalWords2) {
    // Define the next chunk boundaries
    const start1 = previousEnd1;
    const end1 = Math.min(start1 + batchSize, totalWords1);

    const start2 = previousEnd2;
    const end2 = Math.min(start2 + batchSize, totalWords2);

    // Adaptive: If many diffs, smaller batch (max 3x downscale)
    const recentDiffs = differences.slice(-100).filter(([c]) => c !== 'black').length;
    // If difference is too high decrease batch size for more granular check
    const dynamicBatchSize = Math.max(batchSize / Math.min(8, 1 + recentDiffs / 50), batchSize / 8);

    const extendedEnd1 = Math.min(end1 + dynamicBatchSize, totalWords1);
    const extendedEnd2 = Math.min(end2 + dynamicBatchSize, totalWords2);

    const batchWords1 = words1.slice(start1, extendedEnd1);
    const batchWords2 = words2.slice(start2, extendedEnd2);

    // Include overlap from the previous chunk
    const overlapStart1 = Math.max(0, previousEnd1 - overlapSize);
    const overlapStart2 = Math.max(0, previousEnd2 - overlapSize);
    const overlapWords1 = previousEnd1 > 0 ? words1.slice(overlapStart1, previousEnd1) : [];
    const overlapWords2 = previousEnd2 > 0 ? words2.slice(overlapStart2, previousEnd2) : [];


    // Combine overlaps and current batches for comparison
    const combinedWords1 = [...overlapWords1, ...batchWords1];
    const combinedWords2 = [...overlapWords2, ...batchWords2];

    // Perform the diff on the combined words
    const batchDifferences = diff(combinedWords1, combinedWords2, color1, color2);

    const combinedIndices1 = [];
    for (let i = overlapStart1; i < previousEnd1; i++) {
      combinedIndices1.push(i);
    }
    for (let i = start1; i < extendedEnd1; i++) {
      combinedIndices1.push(i);
    }

    const combinedIndices2 = [];
    for (let i = overlapStart2; i < previousEnd2; i++) {
      combinedIndices2.push(i);
    }
    for (let i = start2; i < extendedEnd2; i++) {
      combinedIndices2.push(i);
    }

    let pointer1 = 0;
    let pointer2 = 0;

    const filteredBatch = [];
    batchDifferences.forEach(([color, word]) => {
      if (color === color1) {
        const globalIndex1 = combinedIndices1[pointer1];
        if (globalIndex1 === undefined || !processed1.has(globalIndex1)) {
          filteredBatch.push([color, word]);
        }
        if (globalIndex1 !== undefined) {
          processed1.add(globalIndex1);
        }
        pointer1++;
      } else if (color === color2) {
        const globalIndex2 = combinedIndices2[pointer2];
        if (globalIndex2 === undefined || !processed2.has(globalIndex2)) {
          filteredBatch.push([color, word]);
        }
        if (globalIndex2 !== undefined) {
          processed2.add(globalIndex2);
        }
        pointer2++;
      } else {
        const globalIndex1 = combinedIndices1[pointer1];
        const globalIndex2 = combinedIndices2[pointer2];
        const alreadyProcessed = (globalIndex1 !== undefined && processed1.has(globalIndex1)) && (globalIndex2 !== undefined && processed2.has(globalIndex2));
        if (!alreadyProcessed) {
          filteredBatch.push([color, word]);
        }
        if (globalIndex1 !== undefined) {
          processed1.add(globalIndex1);
        }
        if (globalIndex2 !== undefined) {
          processed2.add(globalIndex2);
        }
        pointer1++;
        pointer2++;
      }
    });

    differences.push(...filteredBatch);

    // Mark as processed
    for (let k = start1; k < end1; k++) processed1.add(k);
    for (let k = start2; k < end2; k++) processed2.add(k);

    previousEnd1 = end1;
    previousEnd2 = end2;

    // Yield for async (avoids blocking)
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  return differences;
}

// Standard diff function for small text comparisons
function diff(words1, words2, color1, color2) {
  console.log(`Diff: ${words1.length} vs ${words2.length} words`);
  const oldStr = words1.join(' '); // As string for diff.js
  const newStr = words2.join(' ');
  // Static method: No 'new' needed, avoids constructor error
  const changes = Diff.diffWords(oldStr, newStr, { ignoreWhitespace: true });

  // Map changes to [color, word] format (change.value and added/removed)
  const differences = [];
  changes.forEach(change => {
    const value = change.value;
    const op = change.added ? 1 : change.removed ? -1 : 0;

    // Split value into words and process
    const words = value.split(/\s+/).filter(w => w.length > 0);
    words.forEach(word => {
      if (op === 0) { // Equal
        differences.push(['black', word]);
      } else if (op === 1) { // Insert
        differences.push([color2, word]);
      } else if (op === -1) { // Delete
        differences.push([color1, word]);
      }
    });
  });

  return differences;
}
