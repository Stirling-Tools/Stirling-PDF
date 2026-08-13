package stirling.software.SPDF.controller.api.converters;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
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
import stirling.software.common.util.RegexPatternUtils;
import stirling.software.common.util.SvgSanitizer;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ConvertApi
@RequiredArgsConstructor
@Slf4j
public class ConvertOfficeController {

    private static final int SNIFF_BYTES = 8192;

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final RuntimePathConfig runtimePathConfig;
    private final CustomHtmlSanitizer customHtmlSanitizer;
    private final OfficeDocumentSanitizer officeDocumentSanitizer;
    private final SvgSanitizer svgSanitizer;
    private final EndpointConfiguration endpointConfiguration;
    private final TempFileManager tempFileManager;

    private enum SniffedContent {
        ZIP_OFFICE,
        FLAT_XML_OFFICE,
        SVG,
        HTML,
        UNKNOWN
    }

    private boolean isUnoconvertAvailable() {
        return endpointConfiguration.isGroupEnabled("Unoconvert")
                || endpointConfiguration.isGroupEnabled("Python");
    }

    public File convertToPdf(MultipartFile inputFile) throws IOException, InterruptedException {
        // Check for valid file extension and sanitize filename
        String originalFilename = Filenames.toSimpleFileName(inputFile.getOriginalFilename());
        if (originalFilename == null || originalFilename.isBlank()) {
            throw ExceptionUtils.createFileNoNameException();
        }

        // Check for valid file extension
        String extension = FilenameUtils.getExtension(originalFilename);
        if (extension == null || !isValidFileExtension(extension)) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalid.extension", "Invalid file extension: " + extension);
        }
        String extensionLower = extension.toLowerCase(Locale.ROOT);

        String baseName = FilenameUtils.getBaseName(originalFilename);
        if (baseName == null || baseName.isBlank()) {
            baseName = "input";
        }

        // create temporary working directory
        Path workDir = Files.createTempDirectory("office2pdf_");
        Path inputPath = workDir.resolve(baseName + "." + extensionLower);
        Path outputPath = workDir.resolve(baseName + ".pdf");

        try {
            writeSanitizedInput(inputFile, inputPath, extensionLower);
        } catch (IOException e) {
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

    // Sanitize input before LibreOffice sees it so embedded URLs can't trigger SSRF.
    private void writeSanitizedInput(MultipartFile inputFile, Path inputPath, String extensionLower)
            throws IOException {
        byte[] head;
        try (InputStream in = inputFile.getInputStream()) {
            head = in.readNBytes(SNIFF_BYTES);
        }
        SniffedContent sniffed = sniffContent(head);
        boolean htmlExtension = "html".equals(extensionLower) || "htm".equals(extensionLower);

        if (htmlExtension || sniffed == SniffedContent.HTML) {
            String htmlContent = new String(inputFile.getBytes(), StandardCharsets.UTF_8);
            String sanitizedHtml = customHtmlSanitizer.sanitize(htmlContent);
            Files.writeString(inputPath, sanitizedHtml, StandardCharsets.UTF_8);
        } else if (sniffed == SniffedContent.SVG) {
            Files.write(inputPath, svgSanitizer.sanitize(inputFile.getBytes()));
        } else if (sniffed == SniffedContent.FLAT_XML_OFFICE) {
            Files.write(inputPath, officeDocumentSanitizer.sanitizeFlatXml(inputFile.getBytes()));
        } else if (sniffed == SniffedContent.ZIP_OFFICE) {
            Files.write(
                    inputPath, officeDocumentSanitizer.sanitizeZipContainer(inputFile.getBytes()));
        } else if (officeDocumentSanitizer.isSanitizableExtension(extensionLower)) {
            byte[] sanitized =
                    officeDocumentSanitizer.sanitize(inputFile.getBytes(), extensionLower);
            Files.write(inputPath, sanitized);
        } else {
            Files.copy(inputFile.getInputStream(), inputPath, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    // LibreOffice routes on content, not extension, so sniffing decides; unknown stays as today.
    private SniffedContent sniffContent(byte[] head) {
        if (head == null || head.length < 4) {
            return SniffedContent.UNKNOWN;
        }
        if (head[0] == 0x50 && head[1] == 0x4B && head[2] == 0x03 && head[3] == 0x04) {
            return isOfficeZip(head) ? SniffedContent.ZIP_OFFICE : SniffedContent.UNKNOWN;
        }
        String rootElement = firstElementName(decodeHead(head));
        if ("svg".equals(rootElement) || rootElement.endsWith(":svg")) {
            return SniffedContent.SVG;
        }
        if (rootElement.startsWith("office:document") || "w:worddocument".equals(rootElement)) {
            return SniffedContent.FLAT_XML_OFFICE;
        }
        if ("html".equals(rootElement)) {
            return SniffedContent.HTML;
        }
        return SniffedContent.UNKNOWN;
    }

    // Only re-zip containers that look like OOXML/ODF; other archives keep the raw copy path.
    private boolean isOfficeZip(byte[] head) {
        if (head.length < 30) {
            return false;
        }
        int nameLength = (head[26] & 0xFF) | ((head[27] & 0xFF) << 8);
        if (nameLength <= 0 || 30 + nameLength > head.length) {
            return false;
        }
        String firstEntry =
                new String(head, 30, nameLength, StandardCharsets.ISO_8859_1)
                        .toLowerCase(Locale.ROOT);
        return "mimetype".equals(firstEntry) || "[content_types].xml".equals(firstEntry);
    }

    private String decodeHead(byte[] head) {
        if (head.length >= 2) {
            if ((head[0] & 0xFF) == 0xFF && (head[1] & 0xFF) == 0xFE) {
                return new String(head, StandardCharsets.UTF_16LE);
            }
            if ((head[0] & 0xFF) == 0xFE && (head[1] & 0xFF) == 0xFF) {
                return new String(head, StandardCharsets.UTF_16BE);
            }
        }
        return new String(head, StandardCharsets.UTF_8);
    }

    // Returns the lower-cased root element name, or empty when the input is not markup.
    private String firstElementName(String prefix) {
        int i = 0;
        while (i < prefix.length()) {
            char c = prefix.charAt(i);
            if (Character.isWhitespace(c) || c == '\uFEFF') {
                i++;
                continue;
            }
            if (c != '<') {
                return "";
            }
            if (prefix.startsWith("<?", i)) {
                int end = prefix.indexOf("?>", i);
                if (end < 0) {
                    return "";
                }
                i = end + 2;
                continue;
            }
            if (prefix.startsWith("<!--", i)) {
                int end = prefix.indexOf("-->", i);
                if (end < 0) {
                    return "";
                }
                i = end + 3;
                continue;
            }
            // a doctype declares the root element, so its name answers the question
            if (prefix.regionMatches(true, i, "<!doctype", 0, 9)) {
                return readName(prefix, skipWhitespace(prefix, i + 9));
            }
            if (prefix.startsWith("<!", i)) {
                return "";
            }
            return readName(prefix, i + 1);
        }
        return "";
    }

    private int skipWhitespace(String value, int from) {
        int i = from;
        while (i < value.length() && Character.isWhitespace(value.charAt(i))) {
            i++;
        }
        return i;
    }

    private String readName(String value, int from) {
        int end = from;
        while (end < value.length()) {
            char c = value.charAt(end);
            if (Character.isWhitespace(c) || c == '>' || c == '/') {
                break;
            }
            end++;
        }
        return value.substring(from, end).toLowerCase(Locale.ROOT);
    }

    private boolean isValidFileExtension(String fileExtension) {
        return RegexPatternUtils.getInstance()
                .getFileExtensionValidationPattern()
                .matcher(fileExtension)
                .matches();
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
