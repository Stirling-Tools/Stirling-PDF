/// <reference lib="webworker" />

import { extractLayers } from "@app/components/viewer/layerParser";
import type {
  LayerParseRequest,
  LayerParseResponse,
} from "@app/components/viewer/layerParser";

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async (event: MessageEvent<LayerParseRequest>) => {
  let response: LayerParseResponse;
  try {
    // The worker reads the blob itself: the bytes never touch the main thread,
    // and Blob structured cloning does not copy the content.
    const bytes = await event.data.blob.arrayBuffer();
    response = { layers: await extractLayers(bytes) };
  } catch (cause) {
    response = {
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
  self.postMessage(response);
};
