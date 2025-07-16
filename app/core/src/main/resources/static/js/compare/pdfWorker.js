importScripts('./diff.js');

self.onmessage = async function (e) {
  const { text1, text2, color1, color2 } = e.data;
  console.log('Received text for comparison:', { text1, text2 });

  const startTime = performance.now();

  if (text1.trim() === "" || text2.trim() === "") {
    self.postMessage({ status: 'error', message: 'One or both of the texts are empty.' });
    return;
  }

  const words1 = text1.split(' ');
  const words2 = text2.split(' ');
  const MAX_WORD_COUNT = 150000;
  const COMPLEX_WORD_COUNT = 50000;
  const BATCH_SIZE = 5000; // Define a suitable batch size for processing
  const OVERLAP_SIZE = 200;  // Number of words to overlap - bigger increases accuracy but affects performance

  const isComplex = words1.length > COMPLEX_WORD_COUNT || words2.length > COMPLEX_WORD_COUNT;
  const isTooLarge = words1.length > MAX_WORD_COUNT || words2.length > MAX_WORD_COUNT;

  let complexMessage = 'One or both of the provided documents are large files, accuracy of comparison may be reduced';
  let tooLargeMessage = 'One or Both of the provided documents are too large to process';

  // Listen for messages from the main thread
  self.addEventListener('message', (event) => {
    if (event.data.type === 'SET_TOO_LARGE_MESSAGE') {
      tooLargeMessage = event.data.message;
    }
    if (event.data.type === 'SET_COMPLEX_MESSAGE') {
      complexMessage = event.data.message;
    }
  });

  if (isTooLarge) {
    self.postMessage({
      status: 'warning',
      message: tooLargeMessage,
    });
    return;
  } else {

    if (isComplex) {
      self.postMessage({
        status: 'warning',
        message: complexMessage,
      });
    }
    // Perform diff operation depending on document size
    const differences = isComplex
      ? await staggeredBatchDiff(words1, words2, color1, color2, BATCH_SIZE, OVERLAP_SIZE)
      : diff(words1, words2, color1, color2);

    console.log(`Diff operation took ${performance.now() - startTime} milliseconds`);
    self.postMessage({ status: 'success', differences });
  }
};

//Splits text into smaller batches to run through diff checking algorithms. overlaps the batches to help ensure
async function staggeredBatchDiff(words1, words2, color1, color2, batchSize, overlapSize) {
  const differences = [];
  const totalWords1 = words1.length;
  const totalWords2 = words2.length;

  let previousEnd1 = 0; // Track where the last batch ended in words1
  let previousEnd2 = 0; // Track where the last batch ended in words2

  // Function to determine if differences are large, differences that are too large indicate potential error in batching
  const isLargeDifference = (differences) => {
    return differences.length > 50;
  };

  while (previousEnd1 < totalWords1 || previousEnd2 < totalWords2) {
    // Define the next chunk boundaries
    const start1 = previousEnd1;
    const end1 = Math.min(start1 + batchSize, totalWords1);

    const start2 = previousEnd2;
    const end2 = Math.min(start2 + batchSize, totalWords2);

    //If difference is too high decrease batch size for more granular check
    const dynamicBatchSize = isLargeDifference(differences) ? batchSize / 2 : batchSize;

    // Adjust the size of the current chunk using dynamic batch size
    const batchWords1 = words1.slice(start1, end1 + dynamicBatchSize);
    const batchWords2 = words2.slice(start2, end2 + dynamicBatchSize);

    // Include overlap from the previous chunk
    const overlapWords1 = previousEnd1 > 0 ? words1.slice(Math.max(0, previousEnd1 - overlapSize), previousEnd1) : [];
    const overlapWords2 = previousEnd2 > 0 ? words2.slice(Math.max(0, previousEnd2 - overlapSize), previousEnd2) : [];

    // Combine overlaps and current batches for comparison
    const combinedWords1 = overlapWords1.concat(batchWords1);
    const combinedWords2 = overlapWords2.concat(batchWords2);

    // Perform the diff on the combined words
    const batchDifferences = diff(combinedWords1, combinedWords2, color1, color2);
    differences.push(...batchDifferences);

    // Update the previous end indices based on the results of this batch
    previousEnd1 = end1;
    previousEnd2 = end2;
  }

  return differences;
}


// Standard diff function for small text comparisons
function diff(words1, words2, color1, color2) {
  console.log(`Starting diff between ${words1.length} words and ${words2.length} words`);
  const matrix = Array.from({ length: words1.length + 1 }, () => Array(words2.length + 1).fill(0));

  for (let i = 1; i <= words1.length; i++) {
    for (let j = 1; j <= words2.length; j++) {
      matrix[i][j] = words1[i - 1] === words2[j - 1]
        ? matrix[i - 1][j - 1] + 1
        : Math.max(matrix[i][j - 1], matrix[i - 1][j]);
    }
  }
  return backtrack(matrix, words1, words2, color1, color2);
}

// Backtrack function to find differences
function backtrack(matrix, words1, words2, color1, color2) {
  let i = words1.length, j = words2.length;
  const differences = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && words1[i - 1] === words2[j - 1]) {
      differences.unshift(['black', words1[i - 1]]);
      i--; j--;
    } else if (j > 0 && (i === 0 || matrix[i][j] === matrix[i][j - 1])) {
      differences.unshift([color2, words2[j - 1]]);
      j--;
    } else {
      differences.unshift([color1, words1[i - 1]]);
      i--;
    }
  }

  return differences;
}
