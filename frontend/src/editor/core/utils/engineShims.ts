// Browser APIs the app is entitled to assume exist, stood in where an engine
// omits them. Import once, first, before anything that might use them.
import "@app/utils/patchReadableStreamAsyncIterator";
import "@app/utils/patchRequestIdleCallback";
