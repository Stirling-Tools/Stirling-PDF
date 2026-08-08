package stirling.software.SPDF.controller.api.security;

import java.awt.Color;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;
import java.util.stream.Collectors;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.InitBinder;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.PDFText;
import stirling.software.SPDF.model.api.security.ManualRedactPdfRequest;
import stirling.software.SPDF.model.api.security.RedactExecuteRequest;
import stirling.software.SPDF.model.api.security.RedactExecuteRequest.ImageBox;
import stirling.software.SPDF.model.api.security.RedactExecuteRequest.RedactStyle;
import stirling.software.SPDF.model.api.security.RedactExecuteRequest.TextRange;
import stirling.software.SPDF.model.api.security.RedactPdfRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.SecurityApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.api.security.RedactionArea;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.PdfUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.common.util.propertyeditor.JsonListPropertyEditor;
import stirling.software.common.util.propertyeditor.JsonObjectPropertyEditor;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.redact.PdfRedactor;
import stirling.software.jpdfium.redact.RedactOptions;
import stirling.software.jpdfium.redact.RedactResult;

import tools.jackson.core.type.TypeReference;

@SecurityApi
@Slf4j
@RequiredArgsConstructor
public class RedactController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final ManualRedactionService manualRedactionService;
    private final TextRedactionService textRedactionService;
    private final RedactExecuteService redactExecuteService;

    private String removeFileExtension(String filename) {
        return stirling.software.common.util.GeneralUtils.removeExtension(filename);
    }

    @InitBinder
    public void initBinder(WebDataBinder binder) {
        binder.registerCustomEditor(
                List.class,
                "redactions",
                new JsonListPropertyEditor<>(new TypeReference<List<RedactionArea>>() {}));
        binder.registerCustomEditor(
                List.class,
                "ranges",
                new JsonListPropertyEditor<>(new TypeReference<List<TextRange>>() {}));
        binder.registerCustomEditor(
                List.class,
                "imageBoxes",
                new JsonListPropertyEditor<>(new TypeReference<List<ImageBox>>() {}));
        binder.registerCustomEditor(
                RedactStyle.class, "style", new JsonObjectPropertyEditor<>(RedactStyle.class));
    }

    @AutoJobPostMapping(
            value = "/redact",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @StandardPdfResponse
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            operationId = "redactPdfManual",
            summary = "Redacts areas and pages in a PDF document",
            description =
                    "This endpoint redacts content from a PDF file based on manually specified"
                            + " areas. Users can specify areas to redact and optionally convert the PDF to an"
                            + " image.")
    public ResponseEntity<Resource> redactPDF(@ModelAttribute ManualRedactPdfRequest request)
            throws IOException {

        MultipartFile file = request.getFileInput();

        try (PDDocument document = pdfDocumentFactory.load(file)) {
            PDPageTree allPages = document.getDocumentCatalog().getPages();

            manualRedactionService.redactPages(request, document, allPages);
            manualRedactionService.redactAreas(request.getRedactions(), document, allPages);

            if (Boolean.TRUE.equals(request.getConvertPDFToImage())) {
                try (PDDocument convertedPdf = PdfUtils.convertPdfToPdfImage(document)) {
                    return WebResponseUtils.pdfDocToWebResponse(
                            convertedPdf,
                            removeFileExtension(
                                            Objects.requireNonNull(
                                                    Filenames.toSimpleFileName(
                                                            file.getOriginalFilename())))
                                    + "_redacted.pdf",
                            tempFileManager);
                }
            }

            return WebResponseUtils.pdfDocToWebResponse(
                    document,
                    removeFileExtension(
                                    Objects.requireNonNull(
                                            Filenames.toSimpleFileName(file.getOriginalFilename())))
                            + "_redacted.pdf",
                    tempFileManager);
        }
    }

    @AutoJobPostMapping(
            value = "/auto-redact",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @StandardPdfResponse
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Redact PDF automatically",
            operationId = "redactPdfAuto",
            description =
                    "This endpoint automatically redacts text from a PDF file based on specified"
                            + " patterns. Users can provide text patterns to redact, with options for regex"
                            + " and whole word matching.")
    public ResponseEntity<Resource> redactPdf(@ModelAttribute RedactPdfRequest request) {
        if (request.getFileInput() == null || request.getFileInput().isEmpty()) {
            log.error("File input is null or empty");
            throw ExceptionUtils.createFileNullOrEmptyException();
        }

        String rawListOfText = request.getListOfText();
        if (rawListOfText == null || rawListOfText.trim().isEmpty()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.redaction.no.patterns", "No text patterns provided for redaction");
        }

        List<String> terms =
                Arrays.stream(rawListOfText.split("\n"))
                        .map(String::trim)
                        .filter(s -> !s.isEmpty() && s.length() <= 4096)
                        .collect(Collectors.toList());

        if (terms.isEmpty()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.redaction.no.patterns", "No text patterns provided for redaction");
        }

        boolean useRegex = Boolean.TRUE.equals(request.getUseRegex());
        boolean wholeWordSearchBool = Boolean.TRUE.equals(request.getWholeWordSearch());

        if (useRegex) {
            for (String term : terms) {
                try {
                    Pattern.compile(term);
                } catch (PatternSyntaxException e) {
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.redaction.no.patterns", "Invalid regex pattern: " + term);
                }
            }
        }

        String filename =
                removeFileExtension(
                                Objects.requireNonNull(
                                        Filenames.toSimpleFileName(
                                                request.getFileInput().getOriginalFilename())))
                        + "_redacted.pdf";

        Color redactColor = ManualRedactionService.decodeOrDefault(request.getRedactColor());
        int boxColorInt = redactColor.getRGB();

        try (PDDocument document = pdfDocumentFactory.load(request.getFileInput())) {
            if (document == null) {
                log.error("Failed to load PDF document");
                throw ExceptionUtils.createPdfCorruptedException(
                        "during redaction", new IOException("Failed to load PDF document"));
            }

            try (TempFile tempInput = tempFileManager.createManagedTempFile(".pdf")) {
                try {
                    request.getFileInput().transferTo(tempInput.getFile());
                } catch (Exception e) {
                    document.save(tempInput.getFile());
                }

                RedactOptions options =
                        RedactOptions.builder()
                                .addWords(terms)
                                .useRegex(useRegex)
                                .wholeWord(wholeWordSearchBool)
                                .boxColor(boxColorInt)
                                .padding(request.getCustomPadding())
                                .removeContent(true)
                                .convertToImage(Boolean.TRUE.equals(request.getConvertPDFToImage()))
                                .normalizeFonts(false)
                                .fixToUnicode(false)
                                .glyphAware(true)
                                .redactMetadata(true)
                                .build();

                TempFile tempOutput = tempFileManager.createManagedTempFile(".pdf");
                try {
                    try (PdfDocument checkDoc = PdfDocument.open(tempInput.getFile().toPath())) {
                        if (checkDoc.pageCount() <= 0) {
                            throw new IOException("Invalid or empty PDF document");
                        }
                    }

                    log.debug(
                            "Calling JPDFium PdfRedactor.redact in RedactController (terms={})",
                            terms);
                    RedactResult result = PdfRedactor.redact(tempInput.getFile().toPath(), options);
                    log.debug(
                            "JPDFium auto-redact complete (matches={})",
                            result != null ? result.totalMatches() : -1);
                    try {
                        result.save(tempOutput.getFile().toPath());
                        log.info(
                                "JPDFium auto-redact: {} matches processed into {}",
                                result.totalMatches(),
                                filename);
                        return WebResponseUtils.pdfFileToWebResponse(tempOutput, filename);
                    } finally {
                        if (result != null && result.document() != null) {
                            result.document().close();
                        }
                    }
                } catch (Exception e) {
                    tempOutput.close();
                    log.warn(
                            "JPDFium native redaction fell back to manual redaction service: {}",
                            e.getMessage());
                    Map<Integer, List<PDFText>> foundTexts =
                            textRedactionService.findTextToRedact(
                                    document,
                                    terms.toArray(new String[0]),
                                    useRegex,
                                    wholeWordSearchBool);
                    TempFile finalized =
                            manualRedactionService.finalizeRedaction(
                                    document,
                                    foundTexts,
                                    request.getRedactColor(),
                                    request.getCustomPadding(),
                                    request.getConvertPDFToImage(),
                                    false);
                    return WebResponseUtils.pdfFileToWebResponse(finalized, filename);
                }
            }
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            log.error("Redaction operation failed: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to perform PDF redaction: " + e.getMessage(), e);
        }
    }

    @AutoJobPostMapping(
            value = "/redact-execute",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @StandardPdfResponse
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            operationId = "redactExecute",
            summary = "Execute a unified redaction plan on a PDF",
            description =
                    "Unified redaction endpoint that accepts exact strings, regex patterns, and"
                            + " page numbers in a single request. Supports execution strategy hints.")
    public ResponseEntity<Resource> executeRedaction(@ModelAttribute RedactExecuteRequest request)
            throws IOException {

        if (request.getFileInput() == null) {
            throw ExceptionUtils.createFileNullOrEmptyException();
        }

        String filename =
                removeFileExtension(
                                Objects.requireNonNull(
                                        Filenames.toSimpleFileName(
                                                request.getFileInput().getOriginalFilename())))
                        + "_redacted.pdf";

        TempFile out = redactExecuteService.execute(request);
        return WebResponseUtils.pdfFileToWebResponse(out, filename);
    }
}
