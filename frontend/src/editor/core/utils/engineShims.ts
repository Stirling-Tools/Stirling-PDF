// Browser APIs the app is entitled to assume exist, stood in where an engine
// omits them. Import once, first, before anything that might use them.
import "@editor/utils/patchReadableStreamAsyncIterator";
import "@editor/utils/patchRequestIdleCallback";
