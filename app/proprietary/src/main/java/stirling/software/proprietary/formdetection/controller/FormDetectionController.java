package stirling.software.proprietary.formdetection.controller;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.FormUtils;
import stirling.software.common.util.FormUtils.NewFormFieldDefinition;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.proprietary.formdetection.inference.OnnxFormDetector;
import stirling.software.proprietary.formdetection.inference.RfDetr;
import stirling.software.proprietary.formdetection.inference.Yolo;
import stirling.software.proprietary.formdetection.model.DetectedField;
import stirling.software.proprietary.formdetection.model.ModelCatalogEntry;
import stirling.software.proprietary.formdetection.render.CoordinateMapper;
import stirling.software.proprietary.formdetection.render.PageRasterizer;
import stirling.software.proprietary.formdetection.service.FormDetectionModelManager;

/**
 * Server-side detection endpoint. Gated behind the {@code form-detection} endpoint key, which is
 * disabled until a model is installed (so the tool tile is greyed in the UI). Returns the shared
 * detection schema, or - when {@code applyToPdf=true} - the AcroForm-applied PDF.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/form/form-detection")
@ConditionalOnClass(name = "ai.onnxruntime.OrtEnvironment")
@RequiredArgsConstructor
@Tag(name = "Auto Form Detection")
public class FormDetectionController {

    /** Hard bound on pages per request; inference is ~1s/page, so this caps worst-case work. */
    static final int MAX_PAGES = 500;

    /** Cap on total fields; past this an output PDF is unusable and NMS cost is O(n^2). */
    static final int MAX_FIELDS = 2000;

    private final FormDetectionModelManager manager;
    private final OnnxFormDetector detector;
    private final PageRasterizer rasterizer;
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @PostMapping(value = "/detect", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Detect form fields with the installed AI model",
            description =
                    "Runs the installed ONNX model over each page and returns detected fields in"
                            + " PDF points. With applyToPdf=true, returns the fillable PDF instead.")
    public ResponseEntity<?> detect(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "confThreshold", required = false) Float confThreshold,
            @RequestParam(value = "applyToPdf", required = false, defaultValue = "false")
                    boolean applyToPdf)
            throws IOException {

        if (file.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("reason", "INVALID_PDF", "message", "The uploaded file is empty"));
        }
        if (!manager.isReady()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(
                            Map.of(
                                    "reason",
                                    "DEPENDENCY",
                                    "message",
                                    "AI form-detection model is not installed"));
        }
        ModelCatalogEntry spec = manager.getActiveEntry().orElse(null);
        if (spec == null) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(
                            Map.of(
                                    "reason",
                                    "DEPENDENCY",
                                    "message",
                                    "Active model spec unavailable"));
        }
        // An out-of-range or NaN threshold would keep essentially every anchor.
        float score =
                confThreshold != null && !confThreshold.isNaN()
                        ? Math.clamp(confThreshold, 0f, 1f)
                        : spec.getScoreThreshold();
        byte[] pdfBytes = file.getBytes();

        // Pages are consumed as they are rendered, so only one page of RGBA is ever live.
        List<DetectedField> collected = new ArrayList<>();
        List<DetectedField> detections;
        try {
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
            detections = collected;
            if (collected.size() > MAX_FIELDS) {
                log.info(
                        "Capping {} detections to {} highest-confidence fields",
                        collected.size(),
                        MAX_FIELDS);
                collected.sort((a, b) -> Double.compare(b.confidence(), a.confidence()));
                detections = new ArrayList<>(collected.subList(0, MAX_FIELDS));
            }
        } catch (PageRasterizer.PageLimitExceededException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("reason", "LIMIT", "message", e.getMessage()));
        } catch (PageRasterizer.UnreadablePdfException e) {
            // The user's file is the problem, not the engine - do not report this as a dependency
            // failure, which would send an admin looking for a missing model.
            log.debug("Auto Form Detection rejected an unreadable PDF: {}", e.getMessage());
            return ResponseEntity.badRequest()
                    .body(Map.of("reason", "INVALID_PDF", "message", e.getMessage()));
        } catch (IllegalStateException e) {
            // e.g. ONNX Runtime native unavailable for this OS/arch - report unavailable cleanly
            // rather than a 500. Cannot happen on a normally-built jar (all platforms bundled), but
            // keeps a slimmed/mis-targeted build from erroring.
            log.warn("Auto Form Detection inference unavailable: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("reason", "DEPENDENCY", "message", e.getMessage()));
        }

        if (applyToPdf) {
            // PDFium is more forgiving than PDFBox, so a file can rasterize and still fail to load
            // here; that is still the file's fault rather than the server's.
            try (PDDocument document = pdfDocumentFactory.load(file)) {
                FormUtils.repairMissingWidgetPageReferences(document);
                List<NewFormFieldDefinition> defs = new ArrayList<>();
                for (DetectedField f : detections) {
                    defs.add(toDefinition(f));
                }
                FormUtils.addFields(document, defs);
                return WebResponseUtils.pdfDocToWebResponse(
                        document, baseName(file) + ".pdf", tempFileManager);
            } catch (IOException e) {
                log.debug("Auto Form Detection could not apply fields: {}", e.getMessage());
                return ResponseEntity.badRequest()
                        .body(
                                Map.of(
                                        "reason",
                                        "INVALID_PDF",
                                        "message",
                                        "The PDF could not be opened for editing; it may be"
                                                + " corrupt or password-protected"));
            }
        }
        return ResponseEntity.ok(new DetectResponse(detections));
    }

    /**
     * Pick the decoder the model's head needs. Unknown values fall back to YOLO, which is what
     * every catalogue entry was before a second head shape existed.
     */
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

    private static NewFormFieldDefinition toDefinition(DetectedField f) {
        DetectedField.RectPt r = f.rectInPdfPoints();
        // Trailing nulls are fontSize, readOnly, multiline, maxLength and buttonAction:
        // a detector reports geometry and type only, so each takes its default.
        return new NewFormFieldDefinition(
                null,
                null,
                f.type(),
                f.page(),
                (float) r.x(),
                (float) r.y(),
                (float) r.w(),
                (float) r.h(),
                Boolean.FALSE,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null);
    }

    private static String baseName(MultipartFile file) {
        String original = Filenames.toSimpleFileName(file.getOriginalFilename());
        if (original == null || original.isBlank()) {
            original = "document";
        }
        String stem =
                original.toLowerCase().endsWith(".pdf")
                        ? original.substring(0, original.length() - 4)
                        : original;
        return stem + "_form";
    }

    /** JSON body returned when {@code applyToPdf} is false. */
    public record DetectResponse(List<DetectedField> detections) {}
}
