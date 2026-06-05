package stirling.software.SPDF.controller.api.security;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Objects;

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
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.PdfUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.common.util.propertyeditor.JsonListPropertyEditor;
import stirling.software.common.util.propertyeditor.JsonObjectPropertyEditor;

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
    @Operation(
            operationId = "redactPdfManual",
            summary = "Redacts areas and pages in a PDF document",
            description =
                    "This endpoint redacts content from a PDF file based on manually specified areas. "
                            + "Users can specify areas to redact and optionally convert the PDF to an image. "
                            + "Input:PDF Output:PDF Type:SISO")
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
    @Operation(
            summary = "Redact PDF automatically",
            operationId = "redactPdfAuto",
            description =
                    "This endpoint automatically redacts text from a PDF file based on specified patterns. "
                            + "Users can provide text patterns to redact, with options for regex and whole word matching. "
                            + "Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<Resource> redactPdf(@ModelAttribute RedactPdfRequest request) {
        String[] listOfText = request.getListOfText().split("\n");
        boolean useRegex = Boolean.TRUE.equals(request.getUseRegex());
        boolean wholeWordSearchBool = Boolean.TRUE.equals(request.getWholeWordSearch());

        if (listOfText.length == 0 || (listOfText.length == 1 && listOfText[0].trim().isEmpty())) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.redaction.no.patterns", "No text patterns provided for redaction");
        }

        PDDocument document = null;
        PDDocument fallbackDocument = null;

        try {
            if (request.getFileInput() == null) {
                log.error("File input is null");
                throw ExceptionUtils.createFileNullOrEmptyException();
            }

            document = pdfDocumentFactory.load(request.getFileInput());

            if (document == null) {
                log.error("Failed to load PDF document");
                throw ExceptionUtils.createPdfCorruptedException(
                        "during redaction", new IOException("Failed to load PDF document"));
            }

            Map<Integer, List<PDFText>> allFoundTextsByPage =
                    textRedactionService.findTextToRedact(
                            document, listOfText, useRegex, wholeWordSearchBool);

            int totalMatches = allFoundTextsByPage.values().stream().mapToInt(List::size).sum();
            log.info(
                    "Redaction scan: {} occurrences across {} pages (patterns={}, regex={}, wholeWord={})",
                    totalMatches,
                    allFoundTextsByPage.size(),
                    listOfText.length,
                    useRegex,
                    wholeWordSearchBool);

            String filename =
                    removeFileExtension(
                                    Objects.requireNonNull(
                                            Filenames.toSimpleFileName(
                                                    request.getFileInput().getOriginalFilename())))
                            + "_redacted.pdf";

            if (allFoundTextsByPage.isEmpty()) {
                log.info("No text found matching redaction patterns");
                return WebResponseUtils.pdfDocToWebResponse(document, filename, tempFileManager);
            }

            boolean fallbackToBoxOnlyMode;
            try {
                fallbackToBoxOnlyMode =
                        textRedactionService.performTextReplacement(
                                document,
                                allFoundTextsByPage,
                                listOfText,
                                useRegex,
                                wholeWordSearchBool);
            } catch (Exception e) {
                log.warn(
                        "Text replacement redaction failed, falling back to box-only mode: {}",
                        e.getMessage());
                fallbackToBoxOnlyMode = true;
            }

            if (fallbackToBoxOnlyMode) {
                log.warn(
                        "Font compatibility issues detected. Using box-only redaction mode for better reliability.");

                fallbackDocument = pdfDocumentFactory.load(request.getFileInput());

                allFoundTextsByPage =
                        textRedactionService.findTextToRedact(
                                fallbackDocument, listOfText, useRegex, wholeWordSearchBool);

                TempFile finalized =
                        manualRedactionService.finalizeRedaction(
                                fallbackDocument,
                                allFoundTextsByPage,
                                request.getRedactColor(),
                                request.getCustomPadding(),
                                request.getConvertPDFToImage(),
                                false);

                return WebResponseUtils.pdfFileToWebResponse(finalized, filename);
            }

            TempFile finalized =
                    manualRedactionService.finalizeRedaction(
                            document,
                            allFoundTextsByPage,
                            request.getRedactColor(),
                            request.getCustomPadding(),
                            request.getConvertPDFToImage(),
                            true);

            return WebResponseUtils.pdfFileToWebResponse(finalized, filename);

        } catch (Exception e) {
            log.error("Redaction operation failed: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to perform PDF redaction: " + e.getMessage(), e);

        } finally {
            if (document != null) {
                try {
                    if (fallbackDocument == null) {
                        document.close();
                    }
                } catch (IOException e) {
                    log.warn("Failed to close main document: {}", e.getMessage());
                }
            }

            if (fallbackDocument != null) {
                try {
                    fallbackDocument.close();
                } catch (IOException e) {
                    log.warn("Failed to close fallback document: {}", e.getMessage());
                }
            }
        }
    }

    @AutoJobPostMapping(
            value = "/redact-execute",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @StandardPdfResponse
    @Operation(
            operationId = "redactExecute",
            summary = "Execute a unified redaction plan on a PDF",
            description =
                    "Unified redaction endpoint that accepts exact strings, regex patterns, and "
                            + "page numbers in a single request. Supports execution strategy hints. "
                            + "Input:PDF Output:PDF Type:SISO")
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
