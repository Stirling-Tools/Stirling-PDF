package stirling.software.proprietary.formdetection.service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.formdetection.inference.OnnxFormDetector;
import stirling.software.proprietary.formdetection.inference.RfDetr;
import stirling.software.proprietary.formdetection.inference.Yolo;
import stirling.software.proprietary.formdetection.model.DetectedField;
import stirling.software.proprietary.formdetection.model.ModelCatalogEntry;
import stirling.software.proprietary.formdetection.render.CoordinateMapper;
import stirling.software.proprietary.formdetection.render.PageRasterizer;

/**
 * Runs the detection pipeline: rasterize, infer, decode, map to PDF points. Callers other than HTTP
 * (a pipeline step, a scheduled job) go through here rather than back through the controller.
 */
@Slf4j
@Service
@ConditionalOnClass(name = "ai.onnxruntime.OrtEnvironment")
@RequiredArgsConstructor
public class FormDetectionService {

    /** Hard bound on pages per request; inference is ~1s/page, so this caps worst-case work. */
    public static final int MAX_PAGES = 500;

    /** Cap on total fields; past this an output PDF is unusable and NMS cost is O(n^2). */
    public static final int MAX_FIELDS = 2000;

    private final FormDetectionModelManager manager;
    private final OnnxFormDetector detector;
    private final PageRasterizer rasterizer;

    /** Thrown when no model is installed, or its catalogue spec has gone missing. */
    public static class ModelUnavailableException extends RuntimeException {
        public ModelUnavailableException(String message) {
            super(message);
        }
    }

    /**
     * Detect fields across every page, in PDF points.
     *
     * @param confThreshold overrides the model's own score threshold; null uses the spec's
     * @throws ModelUnavailableException no model is installed or active
     * @throws PageRasterizer.PageLimitExceededException the document exceeds {@link #MAX_PAGES}
     * @throws PageRasterizer.UnreadablePdfException the PDF is empty, corrupt or password-protected
     * @throws IllegalStateException the ONNX native is missing for this OS/arch
     */
    public List<DetectedField> detect(byte[] pdfBytes, Float confThreshold) throws IOException {
        if (!manager.isReady()) {
            throw new ModelUnavailableException("AI form-detection model is not installed");
        }
        ModelCatalogEntry spec =
                manager.getActiveEntry()
                        .orElseThrow(
                                () ->
                                        new ModelUnavailableException(
                                                "Active model spec unavailable"));

        // An out-of-range or NaN threshold would keep essentially every anchor.
        float score =
                confThreshold != null && !confThreshold.isNaN()
                        ? Math.clamp(confThreshold, 0f, 1f)
                        : spec.getScoreThreshold();

        // Pages are consumed as they are rendered, so only one page of RGBA is ever live.
        List<DetectedField> collected = new ArrayList<>();
        rasterizer.rasterize(
                pdfBytes,
                spec.getInputSize(),
                MAX_PAGES,
                page -> {
                    Yolo.Preprocessed pre =
                            Yolo.preprocess(page.rgba(), page.widthPx(), page.heightPx(), spec);
                    Map<String, Yolo.RawOutput> out =
                            detector.infer(pre.chw(), spec.getInputSize());
                    for (Yolo.Detection d : decodeFor(spec, out, pre, score)) {
                        DetectedField.RectPt rect = CoordinateMapper.toPdfPoints(d, page);
                        if (rect.w() <= 0 || rect.h() <= 0) {
                            continue;
                        }
                        collected.add(
                                new DetectedField(
                                        fieldType(spec, d.classId()),
                                        page.pageIndex(),
                                        rect,
                                        d.score()));
                    }
                });

        if (collected.size() <= MAX_FIELDS) {
            return collected;
        }
        log.info(
                "Capping {} detections to {} highest-confidence fields",
                collected.size(),
                MAX_FIELDS);
        collected.sort((a, b) -> Double.compare(b.confidence(), a.confidence()));
        return new ArrayList<>(collected.subList(0, MAX_FIELDS));
    }

    /** Pick the decoder the model's head needs; an unrecognised value falls back to YOLO. */
    private static List<Yolo.Detection> decodeFor(
            ModelCatalogEntry spec,
            Map<String, Yolo.RawOutput> outputs,
            Yolo.Preprocessed pre,
            float score) {
        if ("rfdetr".equalsIgnoreCase(spec.getDecoder())) {
            return RfDetr.decode(outputs, spec, pre, score);
        }
        // Single-output head: take the sole tensor whatever the graph happens to call it.
        return Yolo.decode(outputs.values().iterator().next(), spec, pre, score);
    }

    private static String fieldType(ModelCatalogEntry spec, int classId) {
        List<String> types = spec.getClassFieldTypes();
        if (types != null && classId >= 0 && classId < types.size()) {
            return types.get(classId);
        }
        return "text";
    }
}
