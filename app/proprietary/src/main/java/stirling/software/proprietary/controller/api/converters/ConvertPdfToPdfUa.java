package stirling.software.proprietary.controller.api.converters;

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

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.proprietary.model.api.converters.PdfToPdfUaRequest;
import stirling.software.proprietary.model.api.ua.PdfUaConversionOutcome;
import stirling.software.proprietary.pdf.ua.PdfUaProfile;
import stirling.software.proprietary.pdf.ua.TaggingOptions;
import stirling.software.proprietary.service.ua.PdfUaConversionService;

/** Converts a PDF to PDF/UA; response headers say whether the result actually conforms. */
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
                        // Only used when the document declares no language of its own.
                        .language(
                                request.getLanguage() == null || request.getLanguage().isBlank()
                                        ? "en-GB"
                                        : request.getLanguage())
                        .overrideLanguage(
                                request.getOverrideLanguage() != null
                                        && request.getOverrideLanguage())
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

        // Streamed from a temp file so a large conversion does not hold a second heap copy.
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
                // Count only: warning text is multi-line prose, which HTTP headers mangle.
                .header(HEADER_WARNINGS, String.valueOf(outcome.warnings().size()))
                .body(response.getBody());
    }

    /**
     * Parses newline-separated {@code key=description} pairs, keyed as the report hands them out.
     * Only the first "=" splits, since a description may contain one.
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
