package stirling.software.proprietary.controller.api;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Locale;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.proprietary.classification.RulesClassifier;

@MiscApi
@RequiredArgsConstructor
public class ClassifyRustController {

    /**
     * The verdict JSON, Base64-encoded because its evidence quotes document text a header cannot
     * carry raw.
     */
    static final String VERDICT_HEADER = "X-Stirling-Classification";

    /** Opening, classifying and saving, per the W3C Server Timing spec. */
    static final String SERVER_TIMING_HEADER = "Server-Timing";

    private final RulesClassifier classifier;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/classify-rust",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    // PDF in, the same PDF out with a verdict on it, so a chain can be checked across this step.
    @ToolIO(accepts = ToolFormat.PDF, produces = ToolFormat.PDF)
    @Operation(
            summary = "Classify a PDF by rules and label its metadata",
            description =
                    "Reads the first five and last two pages, the file name and the metadata,"
                            + " picks up to five labels from the built-in set by rules, and stores"
                            + " them in the StirlingPDFClassification metadata field as the AI"
                            + " classify step does. Runs the same Rust code the editor runs in the"
                            + " browser.")
    public ResponseEntity<byte[]> classify(@Valid @ModelAttribute PDFFile request)
            throws IOException {
        if (!classifier.isAvailable()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "This server was built without the Rust tools library");
        }
        MultipartFile file = request.getFileInput();
        String fileName = fileName(file.getOriginalFilename());
        byte[] input = file.getBytes();
        long started = System.nanoTime();
        RulesClassifier.Classified classified = classifier.classify(input, fileName);
        double processingMs = (System.nanoTime() - started) / 1_000_000.0;

        ResponseEntity<byte[]> response =
                WebResponseUtils.bytesToWebResponse(classified.pdf(), fileName);
        return ResponseEntity.status(response.getStatusCode())
                .headers(response.getHeaders())
                .header(
                        VERDICT_HEADER,
                        Base64.getEncoder()
                                .encodeToString(
                                        classified.verdictJson().getBytes(StandardCharsets.UTF_8)))
                .header(
                        SERVER_TIMING_HEADER,
                        String.format(Locale.ROOT, "process;dur=%.1f", processingMs))
                .body(response.getBody());
    }

    private static String fileName(String original) {
        String name = Filenames.toSimpleFileName(original);
        return (name == null || name.isBlank()) ? "classified.pdf" : name;
    }
}
