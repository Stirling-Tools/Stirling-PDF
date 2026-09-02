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
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

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
import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.api.security.RedactionArea;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
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
@Path("/api/v1/security")
@ApplicationScoped
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

    // MIGRATION (Spring->JAX-RS): the Spring @InitBinder/WebDataBinder mechanism that registered
    // JsonListPropertyEditor/JsonObjectPropertyEditor for the JSON form fields ("redactions",
    // "ranges", "imageBoxes", "style") is not available under RESTEasy Reactive. The form fields
    // are now received as raw JSON strings via @RestForm and parsed inline below with the same
    // property editors, preserving the original parsing behaviour.
    @SuppressWarnings("unchecked")
    private static <T> List<T> parseJsonList(String value, TypeReference<List<T>> typeRef) {
        JsonListPropertyEditor<T> editor = new JsonListPropertyEditor<>(typeRef);
        editor.setAsText(value);
        return (List<T>) editor.getValue();
    }

    private static RedactStyle parseStyle(String value) {
        JsonObjectPropertyEditor<RedactStyle> editor =
                new JsonObjectPropertyEditor<>(RedactStyle.class);
        editor.setAsText(value);
        return (RedactStyle) editor.getValue();
    }

    @POST
    @Path("/redact")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            value = "/redact",
            consumes = MediaType.MULTIPART_FORM_DATA,
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
    public Response redactPDF(
            @RestForm("fileInput") FileUpload fileInput,
            @RestForm("fileId") String fileId,
            @RestForm("pageNumbers") String pageNumbers,
            @RestForm("redactions") String redactions,
            @RestForm("convertPDFToImage") Boolean convertPDFToImage,
            @RestForm("pageRedactionColor") String pageRedactionColor)
            throws IOException {

        ManualRedactPdfRequest request = new ManualRedactPdfRequest();
        request.setFileInput(FileUploadMultipartFile.of(fileInput));
        request.setFileId(fileId);
        request.setPageNumbers(pageNumbers);
        request.setRedactions(
                parseJsonList(redactions, new TypeReference<List<RedactionArea>>() {}));
        request.setConvertPDFToImage(convertPDFToImage);
        request.setPageRedactionColor(pageRedactionColor);

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

    @POST
    @Path("/auto-redact")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            value = "/auto-redact",
            consumes = MediaType.MULTIPART_FORM_DATA,
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
    public Response redactPdf(
            @RestForm("fileInput") FileUpload fileInput,
            @RestForm("fileId") String fileId,
            @RestForm("listOfText") String listOfTextParam,
            @RestForm("useRegex") Boolean useRegexParam,
            @RestForm("wholeWordSearch") Boolean wholeWordSearchParam,
            @RestForm("redactColor") String redactColor,
            @RestForm("customPadding") float customPadding,
            @RestForm("convertPDFToImage") Boolean convertPDFToImage) {
        RedactPdfRequest request = new RedactPdfRequest();
        request.setFileInput(FileUploadMultipartFile.of(fileInput));
        request.setFileId(fileId);
        request.setListOfText(listOfTextParam);
        request.setUseRegex(useRegexParam);
        request.setWholeWordSearch(wholeWordSearchParam);
        request.setRedactColor(redactColor);
        request.setCustomPadding(customPadding);
        request.setConvertPDFToImage(convertPDFToImage);

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

        // Named apart from the @RestForm String parameter of the same name.
        Color decodedRedactColor = ManualRedactionService.decodeOrDefault(request.getRedactColor());
        int boxColorInt = decodedRedactColor.getRGB();

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
                                .ligatureAware(true)
                                .bidiAware(true)
                                .graphemeSafe(true)
                                .sanitizeStructure(false) // WIP/Experimental API
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
                    if (result == null) {
                        throw new IOException("JPDFium auto-redact returned null result");
                    }
                    try {
                        result.save(tempOutput.getFile().toPath());
                        log.info(
                                "JPDFium auto-redact: {} matches processed into {}",
                                result.totalMatches(),
                                filename);
                        return WebResponseUtils.pdfFileToWebResponse(tempOutput, filename);
                    } finally {
                        if (result.document() != null) {
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

    @POST
    @Path("/redact-execute")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            value = "/redact-execute",
            consumes = MediaType.MULTIPART_FORM_DATA,
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @StandardPdfResponse
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            operationId = "redactExecute",
            summary = "Execute a unified redaction plan on a PDF",
            description =
                    "Unified redaction endpoint that accepts exact strings, regex patterns, and"
                            + " page numbers in a single request. Supports execution strategy hints.")
    public Response executeRedaction(
            @RestForm("fileInput") FileUpload fileInput,
            @RestForm("fileId") String fileId,
            @RestForm("textValues") String textValues,
            @RestForm("regexPatterns") String regexPatterns,
            @RestForm("wipePages") String wipePages,
            @RestForm("ranges") String ranges,
            @RestForm("imageBoxes") String imageBoxes,
            @RestForm("redactImagePages") String redactImagePages,
            @RestForm("style") String style)
            throws IOException {

        RedactExecuteRequest request = new RedactExecuteRequest();
        request.setFileInput(FileUploadMultipartFile.of(fileInput));
        request.setFileId(fileId);
        request.setTextValues(parseJsonList(textValues, new TypeReference<List<String>>() {}));
        request.setRegexPatterns(
                parseJsonList(regexPatterns, new TypeReference<List<String>>() {}));
        request.setWipePages(parseJsonList(wipePages, new TypeReference<List<Integer>>() {}));
        request.setRanges(parseJsonList(ranges, new TypeReference<List<TextRange>>() {}));
        request.setImageBoxes(parseJsonList(imageBoxes, new TypeReference<List<ImageBox>>() {}));
        // redactImagePages is nullable: null = skip image redaction, [] = all pages.
        if (redactImagePages != null) {
            request.setRedactImagePages(
                    parseJsonList(redactImagePages, new TypeReference<List<Integer>>() {}));
        }
        if (style != null) {
            request.setStyle(parseStyle(style));
        }

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
