package stirling.software.SPDF.controller.api.converters;

import java.io.File;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

import org.apache.commons.io.FileUtils;
import org.apache.commons.io.FilenameUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.api.GeneralFile;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.CustomHtmlSanitizer;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.OfficeDocumentSanitizer;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ConvertApi
@RequiredArgsConstructor
@Slf4j
public class ConvertOfficeController {

    private static final Charset WINDOWS_1252 = Charset.forName("windows-1252");

    private record ByteOrderMark(byte[] mark, Charset charset) {}

    private static final List<ByteOrderMark> BYTE_ORDER_MARKS =
            List.of(
                    new ByteOrderMark(
                            new byte[] {(byte) 0xFF, (byte) 0xFE}, StandardCharsets.UTF_16LE),
                    new ByteOrderMark(
                            new byte[] {(byte) 0xFE, (byte) 0xFF}, StandardCharsets.UTF_16BE),
                    new ByteOrderMark(
                            new byte[] {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF},
                            StandardCharsets.UTF_8));

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final RuntimePathConfig runtimePathConfig;
    private final CustomHtmlSanitizer customHtmlSanitizer;
    private final OfficeDocumentSanitizer officeDocumentSanitizer;
    private final EndpointConfiguration endpointConfiguration;
    private final TempFileManager tempFileManager;

    private boolean isUnoconvertAvailable() {
        return endpointConfiguration.isGroupEnabled("Unoconvert")
                || endpointConfiguration.isGroupEnabled("Python");
    }

    public File convertToPdf(MultipartFile inputFile) throws IOException, InterruptedException {
        String originalFilename = Filenames.toSimpleFileName(inputFile.getOriginalFilename());
        if (originalFilename == null || originalFilename.isBlank()) {
            throw ExceptionUtils.createFileNoNameException();
        }

        String extension = FilenameUtils.getExtension(originalFilename);
        String extensionLower = extension == null ? "" : extension.toLowerCase(Locale.ROOT).strip();
        if (OfficeImportFilters.forExtension(extensionLower).isEmpty()) {
            // Deliberately says nothing about the rejected name: it is attacker-chosen text that
            // would otherwise be reflected into the response.
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalid.extension", "Unsupported file type for conversion to PDF");
        }

        String baseName = FilenameUtils.getBaseName(originalFilename);
        if (baseName == null || baseName.isBlank()) {
            baseName = "input";
        }

        // create temporary working directory
        Path workDir = Files.createTempDirectory("office2pdf_");
        Path inputPath = workDir.resolve(baseName + "." + extensionLower);
        Path outputPath = workDir.resolve(baseName + ".pdf");

        String importFilter;
        try {
            Files.copy(inputFile.getInputStream(), inputPath, StandardCopyOption.REPLACE_EXISTING);
            // The staged name and the forced filter come from the same lowercased extension, so
            // the type LibreOffice is told to read and the one it sees on disk cannot diverge.
            OfficeImportFilters.Candidate candidate =
                    OfficeImportFilters.resolve(extensionLower, inputPath);
            if (candidate == null) {
                throw invalidContent();
            }
            sanitizeInPlace(inputPath, candidate);
            importFilter = candidate.importFilter();
        } catch (RuntimeException | IOException e) {
            FileUtils.deleteQuietly(workDir.toFile());
            throw e;
        }

        Path libreOfficeProfile = null;
        try {
            ProcessExecutorResult result = null;
            IOException unoconvertException = null;

            // Try unoconvert first if available
            if (isUnoconvertAvailable()) {
                try {
                    List<String> command = new ArrayList<>();
                    command.add(runtimePathConfig.getUnoConvertPath());
                    command.add("--convert-to");
                    command.add("pdf");
                    command.add("--input-filter");
                    command.add(importFilter);
                    command.add(inputPath.toString());
                    command.add(outputPath.toString());

                    result =
                            ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE)
                                    .runCommandWithOutputHandling(command);
                } catch (IOException e) {
                    unoconvertException = e;
                    log.warn(
                            "Unoconvert command failed ({}). Falling back to soffice command.",
                            e.getMessage());
                }
            }

            // Fallback to soffice if unoconvert was unavailable or failed
            if (result == null) {
                libreOfficeProfile = Files.createTempDirectory("libreoffice_profile_");
                List<String> command = new ArrayList<>();
                command.add(runtimePathConfig.getSOfficePath());
                command.add("-env:UserInstallation=" + libreOfficeProfile.toUri().toString());
                command.add("--headless");
                command.add("--nologo");
                command.add("--infilter=" + importFilter);
                command.add("--convert-to");
                command.add("pdf");
                command.add("--outdir");
                command.add(workDir.toString());
                command.add(inputPath.toString());

                try {
                    result =
                            ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE)
                                    .runCommandWithOutputHandling(command);
                } catch (IOException e) {
                    if (unoconvertException != null) {
                        e.addSuppressed(unoconvertException);
                    }
                    throw e;
                }
            }

            // Check the result
            if (result == null) {
                throw new IllegalStateException("Converter returned no result");
            }
            if (result.getRc() != 0) {
                throw new IllegalStateException("Conversion failed (exit " + result.getRc() + ")");
            }

            if (!Files.exists(outputPath)) {
                // Some LibreOffice versions may deviate with exotic names – as a fallback, we try
                // to find any .pdf in the workDir
                try (var stream = Files.list(workDir)) {
                    Path fallback =
                            stream.filter(
                                            p ->
                                                    p.getFileName()
                                                            .toString()
                                                            .toLowerCase(Locale.ROOT)
                                                            .endsWith(".pdf"))
                                    .findFirst()
                                    .orElse(null);
                    if (fallback == null) {
                        throw new IllegalStateException("No PDF produced.");
                    }
                    // Move the found PDF to the expected outputPath
                    Files.move(fallback, outputPath, StandardCopyOption.REPLACE_EXISTING);
                }
            }

            // Check if the output file is empty
            if (Files.size(outputPath) == 0L) {
                throw new IllegalStateException("Produced PDF is empty");
            }

            return outputPath.toFile();
        } finally {
            // Clean up the temporary files
            try {
                Files.deleteIfExists(inputPath);
            } catch (IOException e) {
                log.warn("Failed to delete temp input file: {}", inputPath, e);
            }
            if (libreOfficeProfile != null) {
                FileUtils.deleteQuietly(libreOfficeProfile.toFile());
            }
        }
    }

    /**
     * Rewrites the staged upload in place with the sanitizer the chosen candidate declares. Routing
     * is by the candidate, never by a scan of the bytes deciding what they look like: the import
     * filter is forced from the same candidate, so the type sanitized here is the type LibreOffice
     * reads, and every defeat of this endpoint so far came from a scan reaching a different
     * conclusion than LibreOffice did. A candidate with nothing to strip leaves the file as it was
     * streamed, so a large binary upload is never held in the heap.
     */
    private void sanitizeInPlace(Path inputPath, OfficeImportFilters.Candidate candidate)
            throws IOException {
        if (Files.size(inputPath) == 0L) {
            // Nothing to sanitize; let the converter report the empty input as it always has.
            return;
        }
        if (candidate.sanitizer() != OfficeImportFilters.SanitizerKind.HTML
                && !officeDocumentSanitizer.isSanitizationEnabled()) {
            return;
        }
        try {
            switch (candidate.sanitizer()) {
                case NONE -> {}
                case HTML -> sanitizeHtmlInPlace(inputPath);
                case MARKDOWN -> sanitizeMarkdownInPlace(inputPath);
                case OFFICE_XML -> sanitizeOfficeDocumentInPlace(inputPath);
                case WORD_BINARY -> WordBinarySanitizer.sanitizeInPlace(inputPath);
            }
        } catch (OfficeDocumentSanitizer.UnsanitizableDocumentException e) {
            throw invalidContent();
        }
    }

    private void sanitizeOfficeDocumentInPlace(Path inputPath) throws IOException {
        Files.write(inputPath, officeDocumentSanitizer.sanitize(Files.readAllBytes(inputPath)));
    }

    private void sanitizeHtmlInPlace(Path inputPath) throws IOException {
        String htmlContent = readMarkup(inputPath);
        Files.writeString(
                inputPath, customHtmlSanitizer.sanitize(htmlContent), StandardCharsets.UTF_8);
    }

    private void sanitizeMarkdownInPlace(Path inputPath) throws IOException {
        String markdown = readMarkup(inputPath);
        Files.writeString(
                inputPath,
                MarkdownSanitizer.sanitize(markdown, customHtmlSanitizer),
                StandardCharsets.UTF_8);
    }

    /**
     * Reads a markup upload as text without ever refusing its bytes. A legacy-encoded page is one
     * of the commonest things this endpoint is handed, and {@code Files.readString} reports
     * malformed input rather than substituting, so it turns a Windows-1252 apostrophe into a 500.
     * The fallback is Windows-1252 because that is what a browser and LibreOffice both assume for
     * markup that declares nothing, and it decodes every byte, so this cannot throw.
     */
    private static String readMarkup(Path inputPath) throws IOException {
        byte[] bytes = Files.readAllBytes(inputPath);
        for (ByteOrderMark bom : BYTE_ORDER_MARKS) {
            if (startsWith(bytes, bom.mark())) {
                int length = bom.mark().length;
                return new String(bytes, length, bytes.length - length, bom.charset());
            }
        }
        return new String(bytes, isUtf8(bytes) ? StandardCharsets.UTF_8 : WINDOWS_1252);
    }

    private static boolean startsWith(byte[] bytes, byte[] prefix) {
        return bytes.length >= prefix.length
                && Arrays.equals(bytes, 0, prefix.length, prefix, 0, prefix.length);
    }

    private static boolean isUtf8(byte[] bytes) {
        try {
            StandardCharsets.UTF_8
                    .newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes));
            return true;
        } catch (CharacterCodingException e) {
            return false;
        }
    }

    private static IllegalArgumentException invalidContent() {
        return ExceptionUtils.createIllegalArgumentException(
                "error.invalid.content",
                "File content does not match its type and cannot be converted");
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/file/pdf",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @ToolIO(accepts = ToolFormat.ANY, produces = ToolFormat.PDF)
    @Operation(
            summary = "Convert a file to a PDF using LibreOffice",
            description = "This endpoint converts a given file to a PDF using LibreOffice API")
    public ResponseEntity<Resource> processFileToPDF(@ModelAttribute GeneralFile generalFile)
            throws Exception {
        MultipartFile inputFile = generalFile.getFileInput();
        // unused but can start server instance if startup time is to long
        // LibreOfficeListener.getInstance().start();
        File file = null;
        TempFile tempOut = null;
        try {
            file = convertToPdf(inputFile);

            tempOut = tempFileManager.createManagedTempFile(".pdf");
            try (PDDocument doc = pdfDocumentFactory.load(file)) {
                doc.save(tempOut.getFile());
            }
            String filename =
                    GeneralUtils.generateFilename(
                            inputFile.getOriginalFilename(), "_convertedToPDF.pdf");
            ResponseEntity<Resource> response =
                    WebResponseUtils.pdfFileToWebResponse(tempOut, filename);
            tempOut = null;
            return response;
        } catch (Exception e) {
            if (tempOut != null) {
                tempOut.close();
            }
            throw e;
        } finally {
            if (file != null && file.getParent() != null) {
                FileUtils.deleteDirectory(file.getParentFile());
            }
        }
    }
}
