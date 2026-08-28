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
import stirling.software.proprietary.formdetection.model.DetectedField;
import stirling.software.proprietary.formdetection.render.PageRasterizer;
import stirling.software.proprietary.formdetection.service.FormDetectionService;

/**
 * Detection endpoint, behind the {@code form-detection} key that is disabled until a model is
 * installed. Returns detected fields, or the applied PDF when {@code applyToPdf=true}.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/form/form-detection")
@ConditionalOnClass(name = "ai.onnxruntime.OrtEnvironment")
@RequiredArgsConstructor
@Tag(name = "Auto Form Detection")
public class FormDetectionController {

    private final FormDetectionService detection;
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

        List<DetectedField> detections;
        try {
            detections = detection.detect(file.getBytes(), confThreshold);
        } catch (FormDetectionService.ModelUnavailableException e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("reason", "DEPENDENCY", "message", e.getMessage()));
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
            // ONNX Runtime native missing for this OS/arch (a slimmed or mis-targeted build):
            // report unavailable rather than 500.
            log.warn("Auto Form Detection inference unavailable: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("reason", "DEPENDENCY", "message", e.getMessage()));
        }

        if (!applyToPdf) {
            return ResponseEntity.ok(new DetectResponse(detections));
        }
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
