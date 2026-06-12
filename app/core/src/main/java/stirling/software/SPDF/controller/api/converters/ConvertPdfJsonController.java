package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.StreamingOutput;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.json.PdfJsonDocument;
import stirling.software.SPDF.model.json.PdfJsonMetadata;
import stirling.software.SPDF.service.PdfJsonConversionService;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.api.GeneralFile;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.service.JobOwnershipService;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@Slf4j
@ConvertApi
@ApplicationScoped
@jakarta.ws.rs.Path("/api/v1/convert")
@RequiredArgsConstructor
public class ConvertPdfJsonController {

    private static final Pattern FILE_EXTENSION_PATTERN = Pattern.compile("[.][^.]+$");
    private static final Pattern WHITESPACE_PATTERN = Pattern.compile("[\\r\\n\\t]+");
    private static final Pattern NON_PRINTABLE_PATTERN = Pattern.compile("[^\\x20-\\x7E]");
    private final PdfJsonConversionService pdfJsonConversionService;
    private final TempFileManager tempFileManager;

    // @Autowired(required = false) -> CDI Instance<T> (optional / may be unsatisfied).
    @Inject Instance<JobOwnershipService> jobOwnershipService;

    @POST
    @jakarta.ws.rs.Path("/pdf/text-editor")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = "multipart/form-data",
            value = "/pdf/text-editor",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @Operation(
            summary = "Convert PDF to Text Editor Format",
            description =
                    "Extracts PDF text, fonts, and metadata into an editable JSON structure for the text editor tool. Input:PDF Output:JSON Type:SISO")
    public Response convertPdfToJson(
            @RestForm("fileInput") FileUpload fileUpload,
            @RestForm("lightweight") Boolean lightweightParam)
            throws Exception {
        // TODO: Migration - PDFFile (@ModelAttribute) is not yet migrated to a multipart @BeanParam,
        // so the request model is rebuilt here from individual @RestForm fields. Once the model
        // carries @RestForm annotations, switch to @BeanParam binding.
        PDFFile request = new PDFFile();
        request.setFileInput(FileUploadMultipartFile.of(fileUpload));
        boolean lightweight = Boolean.TRUE.equals(lightweightParam);

        stirling.software.common.model.MultipartFile inputFile = request.getFileInput();
        if (inputFile == null) {
            throw ExceptionUtils.createNullArgumentException("fileInput");
        }

        String originalName = inputFile.getOriginalFilename();
        String baseName =
                (originalName != null && !originalName.isBlank())
                        ? FILE_EXTENSION_PATTERN
                                .matcher(Filenames.toSimpleFileName(originalName))
                                .replaceFirst("")
                        : "document";
        String docName = baseName + ".json";
        TempFile tempOut = tempFileManager.createManagedTempFile(".json");
        try (OutputStream os = Files.newOutputStream(tempOut.getPath())) {
            pdfJsonConversionService.convertPdfToJson(inputFile, lightweight, os);
        } catch (Exception e) {
            tempOut.close();
            throw e;
        }
        try {
            logJsonResponse("pdf/text-editor", tempOut.getPath());
            return WebResponseUtils.fileToWebResponse(
                    tempOut, docName, MediaType.APPLICATION_JSON_TYPE);
        } catch (Exception e) {
            tempOut.close();
            throw e;
        }
    }

    @POST
    @jakarta.ws.rs.Path("/text-editor/pdf")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = "multipart/form-data",
            value = "/text-editor/pdf",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @StandardPdfResponse
    @Operation(
            summary = "Convert Text Editor Format to PDF",
            description =
                    "Rebuilds a PDF from the editable JSON structure generated by the text editor tool. Input:JSON Output:PDF Type:SISO")
    public Response convertJsonToPdf(@RestForm("fileInput") FileUpload fileUpload)
            throws Exception {
        // TODO: Migration - GeneralFile (@ModelAttribute) is not yet migrated to a multipart
        // @BeanParam, so the request model is rebuilt here from the @RestForm file field. Once the
        // model carries @RestForm annotations, switch to @BeanParam binding.
        GeneralFile request = new GeneralFile();
        request.setFileInput(FileUploadMultipartFile.of(fileUpload));

        stirling.software.common.model.MultipartFile jsonFile = request.getFileInput();
        if (jsonFile == null) {
            throw ExceptionUtils.createNullArgumentException("fileInput");
        }

        String originalName = jsonFile.getOriginalFilename();
        String baseName =
                (originalName != null && !originalName.isBlank())
                        ? FILE_EXTENSION_PATTERN
                                .matcher(Filenames.toSimpleFileName(originalName))
                                .replaceFirst("")
                        : "document";
        String docName = baseName.endsWith(".pdf") ? baseName : baseName + ".pdf";
        TempFile tempOut = tempFileManager.createManagedTempFile(".pdf");
        try (OutputStream os = Files.newOutputStream(tempOut.getPath())) {
            pdfJsonConversionService.convertJsonToPdf(jsonFile, os);
        } catch (Exception e) {
            tempOut.close();
            throw e;
        }
        return WebResponseUtils.pdfFileToWebResponse(tempOut, docName);
    }

    @POST
    @jakarta.ws.rs.Path("/pdf/text-editor/metadata")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = "multipart/form-data",
            value = "/pdf/text-editor/metadata",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @Operation(
            summary = "Extract PDF metadata for text editor lazy loading",
            description =
                    "Extracts document metadata, fonts, and page dimensions for the text editor tool. Caches the document for"
                            + " subsequent page requests. Returns a server-generated jobId scoped to the"
                            + " authenticated user. Input:PDF Output:JSON Type:SISO")
    public Response extractPdfMetadata(@RestForm("fileInput") FileUpload fileUpload)
            throws Exception {
        // TODO: Migration - PDFFile (@ModelAttribute) is not yet migrated to a multipart @BeanParam,
        // so the request model is rebuilt here from the @RestForm file field. Once the model carries
        // @RestForm annotations, switch to @BeanParam binding.
        PDFFile request = new PDFFile();
        request.setFileInput(FileUploadMultipartFile.of(fileUpload));

        stirling.software.common.model.MultipartFile inputFile = request.getFileInput();
        if (inputFile == null) {
            throw ExceptionUtils.createNullArgumentException("fileInput");
        }

        String baseJobId = UUID.randomUUID().toString();

        String scopedJobKey = getScopedJobKey(baseJobId);

        log.debug("Extracting metadata for PDF, assigned jobId: {}", scopedJobKey);

        TempFile tempOut = tempFileManager.createManagedTempFile(".json");
        try (OutputStream os = Files.newOutputStream(tempOut.getPath())) {
            pdfJsonConversionService.extractDocumentMetadata(inputFile, scopedJobKey, os);
        } catch (Exception e) {
            tempOut.close();
            throw e;
        }
        try {
            logJsonResponse("pdf/text-editor/metadata", tempOut.getPath());
            // WebResponseUtils.ManagedTempFileResource was removed in the JAX-RS migration; stream
            // the temp file inline (deleting it once written) so we can also attach the X-Job-Id
            // header that this endpoint requires.
            return managedJsonResponseWithHeader(tempOut, "X-Job-Id", scopedJobKey);
        } catch (IOException | RuntimeException e) {
            tempOut.close();
            throw e;
        }
    }

    @POST
    @jakarta.ws.rs.Path("/pdf/text-editor/partial/{jobId}")
    @Consumes(MediaType.APPLICATION_JSON)
    @AutoJobPostMapping(
            value = "/pdf/text-editor/partial/{jobId}",
            consumes = MediaType.APPLICATION_JSON,
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @StandardPdfResponse
    @Operation(
            summary = "Apply incremental edits from text editor to a cached PDF",
            description =
                    "Applies edits for the specified pages of a cached PDF and returns an updated PDF."
                            + " Requires the PDF to have been previously cached via the text editor metadata endpoint."
                            + " The jobId must be obtained from the metadata extraction endpoint.")
    public Response exportPartialPdf(
            @PathParam("jobId") String jobId,
            PdfJsonDocument document,
            @org.jboss.resteasy.reactive.RestQuery("filename") String filename)
            throws Exception {
        if (document == null) {
            throw ExceptionUtils.createNullArgumentException("document");
        }

        validateJobAccess(jobId);

        String baseName =
                (filename != null && !filename.isBlank())
                        ? FILE_EXTENSION_PATTERN
                                .matcher(Filenames.toSimpleFileName(filename))
                                .replaceFirst("")
                        : Optional.ofNullable(document.getMetadata())
                                .map(PdfJsonMetadata::getTitle)
                                .filter(title -> title != null && !title.isBlank())
                                .orElse("document");
        String docName = baseName.endsWith(".pdf") ? baseName : baseName + ".pdf";
        TempFile tempOut = tempFileManager.createManagedTempFile(".pdf");
        try (OutputStream os = Files.newOutputStream(tempOut.getPath())) {
            pdfJsonConversionService.exportUpdatedPages(jobId, document, os);
        } catch (Exception e) {
            tempOut.close();
            throw e;
        }
        try {
            return WebResponseUtils.pdfFileToWebResponse(tempOut, docName);
        } catch (Exception e) {
            tempOut.close();
            throw e;
        }
    }

    @GET
    @jakarta.ws.rs.Path("/pdf/text-editor/page/{jobId}/{pageNumber}")
    @Operation(
            summary = "Extract single page from cached PDF for text editor",
            description =
                    "Retrieves a single page's content from a previously cached PDF document for the text editor tool."
                            + " Requires prior call to /pdf/text-editor/metadata. The jobId must belong to the"
                            + " authenticated user. Output:JSON")
    public Response extractSinglePage(
            @PathParam("jobId") String jobId, @PathParam("pageNumber") int pageNumber)
            throws Exception {

        validateJobAccess(jobId);

        String docName = "page_" + pageNumber + ".json";
        TempFile tempOut = tempFileManager.createManagedTempFile(".json");
        try (OutputStream os = Files.newOutputStream(tempOut.getPath())) {
            pdfJsonConversionService.extractSinglePage(jobId, pageNumber, os);
        } catch (Exception e) {
            tempOut.close();
            throw e;
        }
        try {
            logJsonResponse("pdf/text-editor/page", tempOut.getPath());
            return WebResponseUtils.fileToWebResponse(
                    tempOut, docName, MediaType.APPLICATION_JSON_TYPE);
        } catch (Exception e) {
            tempOut.close();
            throw e;
        }
    }

    @GET
    @jakarta.ws.rs.Path("/pdf/text-editor/fonts/{jobId}/{pageNumber}")
    @Operation(
            summary = "Extract fonts used by a single cached page for text editor",
            description =
                    "Retrieves the font payloads used by a single page from a previously cached PDF document."
                            + " Requires prior call to /pdf/text-editor/metadata. The jobId must belong to the"
                            + " authenticated user. Output:JSON")
    public Response extractPageFonts(
            @PathParam("jobId") String jobId, @PathParam("pageNumber") int pageNumber)
            throws Exception {

        validateJobAccess(jobId);

        String docName = "page_fonts_" + pageNumber + ".json";
        TempFile tempOut = tempFileManager.createManagedTempFile(".json");
        try (OutputStream os = Files.newOutputStream(tempOut.getPath())) {
            pdfJsonConversionService.extractPageFonts(jobId, pageNumber, os);
        } catch (Exception e) {
            tempOut.close();
            throw e;
        }
        try {
            logJsonResponse("pdf/text-editor/fonts/page", tempOut.getPath());
            return WebResponseUtils.fileToWebResponse(
                    tempOut, docName, MediaType.APPLICATION_JSON_TYPE);
        } catch (Exception e) {
            tempOut.close();
            throw e;
        }
    }

    @POST
    @jakarta.ws.rs.Path("/pdf/text-editor/clear-cache/{jobId}")
    @Consumes(MediaType.WILDCARD)
    @AutoJobPostMapping(
            value = "/pdf/text-editor/clear-cache/{jobId}",
            consumes = MediaType.WILDCARD,
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @Operation(
            summary = "Clear cached PDF document for text editor",
            description =
                    "Manually clears a cached PDF document used by the text editor to free up server resources."
                            + " Called automatically after 30 minutes. The jobId must belong to the"
                            + " authenticated user.")
    public Response clearCache(@PathParam("jobId") String jobId) {

        validateJobAccess(jobId);

        pdfJsonConversionService.clearCachedDocument(jobId);
        return Response.ok().build();
    }

    /**
     * Streams a managed temp file as a JSON response with an extra header, deleting the backing
     * {@link TempFile} once the body has been written (or on failure). Mirrors the lifecycle of
     * {@link WebResponseUtils#fileToWebResponse} but allows an additional response header.
     */
    private Response managedJsonResponseWithHeader(
            TempFile tempOut, String headerName, String headerValue) throws IOException {
        Path path = tempOut.getPath();
        long len = Files.size(path);
        StreamingOutput body =
                output -> {
                    try (InputStream in = Files.newInputStream(path)) {
                        in.transferTo(output);
                    } finally {
                        try {
                            tempOut.close();
                        } catch (Exception closeEx) {
                            log.warn(
                                    "Failed to clean up temp file after streaming response",
                                    closeEx);
                        }
                    }
                };
        return Response.ok(body)
                .type(MediaType.APPLICATION_JSON_TYPE)
                .header(headerName, headerValue)
                .header(HttpHeaders.CONTENT_LENGTH, len)
                .build();
    }

    private String getScopedJobKey(String baseJobId) {
        if (jobOwnershipService.isResolvable()) {
            return jobOwnershipService.get().createScopedJobKey(baseJobId);
        }
        return baseJobId;
    }

    private void logJsonResponse(String label, Path jsonPath) {
        if (jsonPath == null) {
            log.warn("Returning {} JSON response: null path", label);
            return;
        }

        boolean debugEnabled = log.isDebugEnabled();
        boolean dumpEnabled = isPdfJsonDebugDumpEnabled();
        boolean repeatScanEnabled = isPdfJsonRepeatScanEnabled();

        // Reading the full file back from disk is only worth it for these diagnostic paths.
        // The happy path (no debug flags) returns here immediately — no extra IO.
        if (!debugEnabled && !dumpEnabled && !repeatScanEnabled) {
            return;
        }

        byte[] jsonBytes;
        try {
            jsonBytes = Files.readAllBytes(jsonPath);
        } catch (IOException ex) {
            log.warn(
                    "Failed to read PDF JSON ({}) for diagnostic logging: {}",
                    label,
                    ex.getMessage());
            return;
        }

        if (debugEnabled) {
            int length = jsonBytes.length;
            boolean endsWithJson =
                    length > 0 && (jsonBytes[length - 1] == '}' || jsonBytes[length - 1] == ']');
            String tail = "";
            if (length > 0) {
                int start = Math.max(0, length - 64);
                tail = new String(jsonBytes, start, length - start, StandardCharsets.UTF_8);
                tail =
                        NON_PRINTABLE_PATTERN
                                .matcher(WHITESPACE_PATTERN.matcher(tail).replaceAll(" "))
                                .replaceAll("?");
            }
            log.debug(
                    "Returning {} JSON response ({} bytes, endsWithJson={}, tail='{}')",
                    label,
                    length,
                    endsWithJson,
                    tail);
        }

        if (dumpEnabled) {
            try {
                String tmpDir = System.getProperty("java.io.tmpdir");
                String customDir = System.getenv("SPDF_PDFJSON_DUMP_DIR");
                Path dumpDir =
                        customDir != null && !customDir.isBlank()
                                ? Path.of(customDir)
                                : Path.of(tmpDir);
                Path dumpPath = Files.createTempFile(dumpDir, "pdfjson_", ".json");
                Files.copy(jsonPath, dumpPath, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                log.debug("PDF JSON debug dump ({}): {}", label, dumpPath);
            } catch (Exception ex) {
                log.warn("Failed to write PDF JSON debug dump ({}): {}", label, ex.getMessage());
            }
        }

        if (repeatScanEnabled) {
            logRepeatedJsonStrings(label, jsonBytes);
        }
    }

    private boolean isPdfJsonDebugDumpEnabled() {
        String env = System.getenv("SPDF_PDFJSON_DUMP");
        if (env != null && env.equalsIgnoreCase("true")) {
            return true;
        }
        return Boolean.getBoolean("spdf.pdfjson.dump");
    }

    private boolean isPdfJsonRepeatScanEnabled() {
        String env = System.getenv("SPDF_PDFJSON_REPEAT_SCAN");
        if (env != null && env.equalsIgnoreCase("true")) {
            return true;
        }
        return Boolean.getBoolean("spdf.pdfjson.repeatScan");
    }

    private void logRepeatedJsonStrings(String label, byte[] jsonBytes) {
        final int minLen = 12;
        final int maxLen = 200;
        final int maxUnique = 50000;
        java.util.Map<String, Integer> counts = new java.util.HashMap<>();
        boolean inString = false;
        boolean escape = false;
        boolean tooLong = false;
        StringBuilder current = new StringBuilder(64);
        boolean capped = false;

        for (byte b : jsonBytes) {
            char ch = (char) (b & 0xFF);
            if (!inString) {
                if (ch == '"') {
                    inString = true;
                    escape = false;
                    tooLong = false;
                    current.setLength(0);
                }
                continue;
            }

            if (escape) {
                escape = false;
                if (!tooLong && current.length() < maxLen) {
                    current.append(ch);
                }
                continue;
            }
            if (ch == '\\') {
                escape = true;
                continue;
            }
            if (ch == '"') {
                inString = false;
                if (!tooLong) {
                    int len = current.length();
                    if (len >= minLen && len <= maxLen) {
                        String value = current.toString();
                        if (!looksLikeBase64(value)) {
                            if (!capped || counts.containsKey(value)) {
                                counts.merge(value, 1, Integer::sum);
                                if (!capped && counts.size() >= maxUnique) {
                                    capped = true;
                                }
                            }
                        }
                    }
                }
                continue;
            }
            if (!tooLong) {
                if (current.length() < maxLen) {
                    current.append(ch);
                } else {
                    tooLong = true;
                }
            }
        }

        java.util.List<java.util.Map.Entry<String, Integer>> top =
                counts.entrySet().stream()
                        .filter(e -> e.getValue() > 1)
                        .sorted((a, b) -> Integer.compare(b.getValue(), a.getValue()))
                        .limit(20)
                        .toList();

        if (!top.isEmpty()) {
            String summary =
                    top.stream()
                            .map(
                                    e ->
                                            String.format(
                                                    "\"%s\"(len=%d,count=%d)",
                                                    truncateForLog(e.getKey()),
                                                    e.getKey().length(),
                                                    e.getValue()))
                            .collect(java.util.stream.Collectors.joining("; "));
            log.debug(
                    "PDF JSON repeat scan ({}): top strings -> {}{}",
                    label,
                    summary,
                    capped ? " (capped)" : "");
        } else {
            log.debug(
                    "PDF JSON repeat scan ({}): no repeated strings found{}",
                    label,
                    capped ? " (capped)" : "");
        }
    }

    private boolean looksLikeBase64(String value) {
        if (value.length() < 32) {
            return false;
        }
        int base64Chars = 0;
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if ((c >= 'A' && c <= 'Z')
                    || (c >= 'a' && c <= 'z')
                    || (c >= '0' && c <= '9')
                    || c == '+'
                    || c == '/'
                    || c == '=') {
                base64Chars++;
            }
        }
        return base64Chars >= value.length() * 0.9;
    }

    private String truncateForLog(String value) {
        int max = 64;
        if (value.length() <= max) {
            return WHITESPACE_PATTERN.matcher(value).replaceAll(" ");
        }
        return WHITESPACE_PATTERN.matcher(value.substring(0, max)).replaceAll(" ") + "...";
    }

    private void validateJobAccess(String jobId) {
        if (jobOwnershipService.isResolvable()) {
            jobOwnershipService.get().validateJobAccess(jobId);
        }
    }
}
