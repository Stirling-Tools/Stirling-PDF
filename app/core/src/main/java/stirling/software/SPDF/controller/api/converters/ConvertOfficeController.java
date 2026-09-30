package stirling.software.SPDF.controller.api.converters;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
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
import stirling.software.SPDF.service.OfficeToPdfService;
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
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ConvertApi
@RequiredArgsConstructor
@Slf4j
public class ConvertOfficeController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final RuntimePathConfig runtimePathConfig;
    private final CustomHtmlSanitizer customHtmlSanitizer;
    private final OfficeDocumentSanitizer officeDocumentSanitizer;
    private final EndpointConfiguration endpointConfiguration;
    private final TempFileManager tempFileManager;
    private final OfficeToPdfService officeToPdfService;

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

        long deadline = officeToPdfService.deadline();
        boolean inProcess = officeToPdfService.handles(extensionLower);
        if (!inProcess && officeToPdfService.enabled() && !isLibreOfficeAvailable()) {
            throw ExceptionUtils.createLibreOfficeRequiredException(extensionLower);
        }

        // create temporary working directory
        Path workDir = Files.createTempDirectory("office2pdf_");
        Path inputPath = workDir.resolve(baseName + "." + extensionLower);
        Path outputPath = workDir.resolve(baseName + ".pdf");

        boolean converted = false;
        try {
            // Sanitize input before any converter sees it so embedded URLs can't trigger SSRF.
            if ("html".equals(extensionLower) || "htm".equals(extensionLower)) {
                String htmlContent = new String(inputFile.getBytes(), StandardCharsets.UTF_8);
                String sanitizedHtml = customHtmlSanitizer.sanitize(htmlContent);
                Files.writeString(inputPath, sanitizedHtml, StandardCharsets.UTF_8);
            } else if (officeDocumentSanitizer.isSanitizableExtension(extensionLower)) {
                try (InputStream in = inputFile.getInputStream();
                        OutputStream out = Files.newOutputStream(inputPath)) {
                    officeDocumentSanitizer.sanitize(in, out, extensionLower);
                }
            } else {
                Files.copy(
                        inputFile.getInputStream(), inputPath, StandardCopyOption.REPLACE_EXISTING);
            }

            if (inProcess) {
                officeToPdfService.convert(
                        inputPath,
                        outputPath,
                        deadline,
                        isLibreOfficeAvailable(),
                        () -> convertWithLibreOffice(workDir, inputPath, outputPath, false));
            } else {
                convertWithLibreOffice(workDir, inputPath, outputPath, true);
            }
            converted = true;
            return outputPath.toFile();
        } finally {
            // Clean up the temporary files
            try {
                Files.deleteIfExists(inputPath);
            } catch (IOException e) {
                log.warn("Failed to delete temp input file: {}", inputPath, e);
            }
            if (!converted) {
                FileUtils.deleteQuietly(workDir.toFile());
            }
        }
    }

    private boolean isLibreOfficeAvailable() {
        return endpointConfiguration.isGroupEnabled("LibreOffice")
                || endpointConfiguration.isGroupEnabled("Unoconvert");
    }

    /**
     * A fallback under a deadline skips the shared unoserver: stopping the unoconvert client would
     * leave the server converting, so it runs its own soffice, which the deadline stops.
     */
    private void convertWithLibreOffice(
            Path workDir, Path inputPath, Path outputPath, boolean viaUnoServer)
            throws IOException, InterruptedException {
        Path libreOfficeProfile = null;
        try {
            ProcessExecutorResult result = null;
            IOException unoconvertException = null;

            // Try unoconvert first if available
            if (viaUnoServer && isUnoconvertAvailable()) {
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

        } finally {
            if (libreOfficeProfile != null) {
                FileUtils.deleteQuietly(libreOfficeProfile.toFile());
            }
        }
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
            summary = "Convert a file to a PDF",
            description =
                    "Converts Word, PowerPoint and Excel files (DOCX, PPTX, XLSX, XLS, PPT) in process with"
                            + " Stirling Office Convert, and other files with LibreOffice")
    public ResponseEntity<Resource> processFileToPDF(@ModelAttribute GeneralFile generalFile)
            throws Exception {
        MultipartFile inputFile = generalFile.getFileInput();
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
