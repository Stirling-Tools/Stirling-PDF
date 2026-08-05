package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;
import java.nio.file.Files;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.converters.PdfToPdfUaRequest;
import stirling.software.SPDF.model.api.ua.PdfUaConversionOutcome;
import stirling.software.SPDF.service.ua.PdfUaConversionService;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.pdf.ua.PdfUaProfile;
import stirling.software.common.pdf.ua.TaggingOptions;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

/**
 * Converts a PDF to PDF/UA.
 *
 * <p>The response headers report what happened, because the returned file is only declared
 * conformant when it actually validated. A caller must be able to tell the difference between "this
 * is now PDF/UA" and "this is better but still needs work", and the body alone cannot say so.
 */
@ConvertApi
@Slf4j
@RequiredArgsConstructor
public class ConvertPdfToPdfUa {

    private static final String HEADER_DECLARED = "X-Stirling-UA-Declared";
    private static final String HEADER_FAILURES = "X-Stirling-UA-Failures";
    private static final String HEADER_ALT_NEEDED = "X-Stirling-UA-Figures-Needing-Alt";
    private static final String HEADER_WARNINGS = "X-Stirling-UA-Warnings";

    /** Any line ending, so descriptions pasted from any platform parse the same. */
    private static final Pattern NEWLINE = Pattern.compile("\\R");

    private final PdfUaConversionService conversionService;
    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/pdf/ua",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Convert a PDF to PDF/UA-1 or PDF/UA-2",
            description =
                    "Tags the document, marks decorative content as artifacts, embeds fonts and"
                            + " applies the document-level requirements of PDF/UA, then validates"
                            + " the result. A conformance declaration is written only if validation"
                            + " passes, so the returned file never claims more than it delivers.")
    public ResponseEntity<Resource> pdfToPdfUa(@ModelAttribute PdfToPdfUaRequest request)
            throws IOException {

        MultipartFile input = request.getFileInput();
        if (input == null || input.isEmpty()) {
            throw ExceptionUtils.createPdfFileRequiredException();
        }

        String originalName = Filenames.toSimpleFileName(input.getOriginalFilename());
        String stem = stripExtension(originalName == null ? "document" : originalName);
        PdfUaProfile profile = PdfUaProfile.fromRequest(request.getProfile());

        TaggingOptions options =
                TaggingOptions.builder()
                        .profile(profile)
                        .title(request.getTitle())
                        .fallbackTitle(stem)
                        .language(
                                request.getLanguage() == null || request.getLanguage().isBlank()
                                        ? "en-GB"
                                        : request.getLanguage())
                        .existingTags(existingTags(request.getExistingTags()))
                        .figurePolicy(figurePolicy(request.getFigurePolicy()))
                        .embedFonts(request.getEmbedFonts() == null || request.getEmbedFonts())
                        .altTextByFigure(parseAltText(request.getAltText()))
                        .build();

        PdfUaConversionOutcome outcome = conversionService.convert(input.getBytes(), options);

        log.info(
                "Converted '{}' to {}: declared={}, {} remaining failure(s)",
                originalName,
                profile.displayName(),
                outcome.declared(),
                outcome.validation().totalFailures());

        outcome.warnings().forEach(warning -> log.info("PDF/UA warning: {}", warning));

        // Streamed from a managed temp file rather than returned as a heap byte[], so a large
        // conversion does not hold another whole copy of the document until Spring writes it.
        String suffix = outcome.declared() ? "_pdfua" + profile.part() : "_tagged";
        TempFile tempOut = tempFileManager.createManagedTempFile(".pdf");
        try {
            Files.write(tempOut.getPath(), outcome.pdfBytes());
        } catch (IOException e) {
            tempOut.close();
            throw e;
        }
        ResponseEntity<Resource> response =
                WebResponseUtils.pdfFileToWebResponse(tempOut, stem + suffix + ".pdf");

        return ResponseEntity.status(response.getStatusCode())
                .headers(response.getHeaders())
                .header(HEADER_DECLARED, String.valueOf(outcome.declared()))
                .header(HEADER_FAILURES, String.valueOf(outcome.validation().totalFailures()))
                .header(
                        HEADER_ALT_NEEDED,
                        String.valueOf(outcome.tagging().figuresNeedingAltText()))
                // Count only: warning text is multi-line prose, which HTTP headers mangle. The
                // accessibility-report endpoint carries the details.
                .header(HEADER_WARNINGS, String.valueOf(outcome.warnings().size()))
                .body(response.getBody());
    }

    /**
     * Parses the newline-separated {@code key=description} form into the map the tagger takes.
     *
     * <p>Keys are the ones the accessibility report hands out, so a caller can enumerate what needs
     * describing and post the answers straight back. Only the first "=" splits, since a description
     * may legitimately contain one.
     */
    public static Map<String, String> parseAltText(String raw) {
        if (raw == null || raw.isBlank()) {
            return Map.of();
        }
        Map<String, String> parsed = new LinkedHashMap<>();
        for (String line : NEWLINE.split(raw)) {
            int split = line.indexOf('=');
            if (split <= 0) {
                continue;
            }
            String key = line.substring(0, split).strip();
            String description = line.substring(split + 1).strip();
            if (!key.isEmpty() && !description.isEmpty()) {
                parsed.put(key, description);
            }
        }
        return parsed;
    }

    private static TaggingOptions.ExistingTags existingTags(String value) {
        if (value == null) {
            return TaggingOptions.ExistingTags.AUTO;
        }
        return switch (value.trim().toLowerCase()) {
            case "keep" -> TaggingOptions.ExistingTags.KEEP;
            case "rebuild" -> TaggingOptions.ExistingTags.REBUILD;
            default -> TaggingOptions.ExistingTags.AUTO;
        };
    }

    private static TaggingOptions.FigurePolicy figurePolicy(String value) {
        if (value != null && value.trim().equalsIgnoreCase("mark-decorative")) {
            return TaggingOptions.FigurePolicy.MARK_DECORATIVE;
        }
        return TaggingOptions.FigurePolicy.REQUIRE_ALT;
    }

    private static String stripExtension(String filename) {
        int dot = filename.lastIndexOf('.');
        return dot > 0 ? filename.substring(0, dot) : filename;
    }
}
