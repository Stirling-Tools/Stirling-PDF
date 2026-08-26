package stirling.software.proprietary.formdetection.inference;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.formdetection.model.ModelCatalogEntry;

/**
 * Decoder for RF-DETR style query-based heads, as used by the Apache-2.0 FFDetr checkpoint.
 *
 * <p>Differs from {@link Yolo} in every respect that matters downstream: two output tensors instead
 * of one, a fixed set of queries instead of an anchor grid, boxes normalised to [0,1] instead of
 * input pixels, and raw logits instead of activated scores. Preprocessing is shared - {@link
 * Yolo#preprocess} already honours the spec's channel order and mean/std, which is all RF-DETR
 * needs (RGB, ImageNet normalisation).
 */
@Slf4j
public final class RfDetr {

    private RfDetr() {}

    /** Normalised box centres/sizes. */
    private static final String BOXES = "dets";

    /** Per-class logits, plus a trailing no-object column. */
    private static final String LOGITS = "labels";

    /**
     * Decode two named outputs into detections in original-bitmap pixels.
     *
     * <p>Outputs are looked up by name, never by position: with three classes both tensors are
     * [300, 4] - four box values against three classes plus the no-object slot - so they cannot be
     * told apart by shape.
     */
    public static List<Yolo.Detection> decode(
            Map<String, Yolo.RawOutput> outputs,
            ModelCatalogEntry spec,
            Yolo.Preprocessed pre,
            float scoreThreshold) {

        int numClasses = spec.getClassNames() == null ? 0 : spec.getClassNames().size();
        if (numClasses == 0) {
            return List.of();
        }
        Yolo.RawOutput boxes = outputs.get(BOXES);
        Yolo.RawOutput logits = outputs.get(LOGITS);
        if (boxes == null || logits == null) {
            log.warn(
                    "rfdetr decoder expects outputs '{}' and '{}'; got {}",
                    BOXES,
                    LOGITS,
                    outputs.keySet());
            return List.of();
        }
        if (boxes.d2() < 4) {
            log.warn("rfdetr '{}' has {} columns, expected >= 4", BOXES, boxes.d2());
            return List.of();
        }
        // The head emits one logit per class plus a no-object slot; anything narrower means the
        // model was trained for a different class set than the catalogue entry claims.
        if (logits.d2() <= numClasses) {
            log.warn(
                    "rfdetr '{}' has {} columns, expected >= {} for {} classes plus no-object;"
                            + " skipping",
                    LOGITS,
                    logits.d2(),
                    numClasses + 1,
                    numClasses);
            return List.of();
        }
        int queries = Math.min(boxes.d1(), logits.d1());

        List<Yolo.Detection> dets = new ArrayList<>();
        for (int q = 0; q < queries; q++) {
            int bestClass = -1;
            float bestScore = 0f;
            // Deliberately stops at numClasses, dropping the trailing no-object column.
            for (int c = 0; c < numClasses; c++) {
                float score = sigmoid(logits.data()[q * logits.d2() + c]);
                if (score > bestScore) {
                    bestScore = score;
                    bestClass = c;
                }
            }
            if (bestClass < 0 || bestScore < scoreThreshold) {
                continue;
            }

            int base = q * boxes.d2();
            // Normalised centre form -> input-space pixels, so the un-projection below is the
            // same arithmetic the YOLO path uses.
            float cx = boxes.data()[base] * pre.inputSize();
            float cy = boxes.data()[base + 1] * pre.inputSize();
            float w = boxes.data()[base + 2] * pre.inputSize();
            float h = boxes.data()[base + 3] * pre.inputSize();

            float x1 = cx - w / 2f;
            float y1 = cy - h / 2f;
            float ox = (x1 - pre.padX()) / pre.scaleX();
            float oy = (y1 - pre.padY()) / pre.scaleY();
            float ow = w / pre.scaleX();
            float oh = h / pre.scaleY();

            float clampedX = Math.max(0, Math.min(ox, pre.srcW()));
            float clampedY = Math.max(0, Math.min(oy, pre.srcH()));
            ow = Math.max(0, Math.min(ow, pre.srcW() - clampedX));
            oh = Math.max(0, Math.min(oh, pre.srcH() - clampedY));
            if (ow <= 0 || oh <= 0) {
                continue;
            }
            dets.add(new Yolo.Detection(bestClass, bestScore, clampedX, clampedY, ow, oh));
        }
        return Yolo.nms(dets, spec.getNms(), spec.getIou());
    }

    private static float sigmoid(float x) {
        return (float) (1.0 / (1.0 + Math.exp(-x)));
    }
}
