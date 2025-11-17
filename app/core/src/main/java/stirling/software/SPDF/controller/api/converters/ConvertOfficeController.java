package stirling.software.SPDF.controller.api.converters;

import java.io.File;
import java.io.IOException;
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
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.api.GeneralFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.CustomHtmlSanitizer;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.RegexPatternUtils;
import stirling.software.common.util.WebResponseUtils;

@RestController
@Tag(name = "Convert", description = "Convert APIs")
@RequestMapping("/api/v1/convert")
@RequiredArgsConstructor
@Slf4j
public class ConvertOfficeController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final RuntimePathConfig runtimePathConfig;
    private final CustomHtmlSanitizer customHtmlSanitizer;
    private final EndpointConfiguration endpointConfiguration;

    private boolean isUnoconvertAvailable() {
        return endpointConfiguration.isGroupEnabled("Unoconvert")
                || endpointConfiguration.isGroupEnabled("Python");
    }

    public File convertToPdf(MultipartFile inputFile) throws IOException, InterruptedException {
        // Check for valid file extension and sanitize filename
        String originalFilename = Filenames.toSimpleFileName(inputFile.getOriginalFilename());
        if (originalFilename == null || originalFilename.isBlank()) {
            throw new IllegalArgumentException("Missing original filename");
        }

        // Check for valid file extension
        String extension = FilenameUtils.getExtension(originalFilename);
        if (extension == null || !isValidFileExtension(extension)) {
            throw new IllegalArgumentException("Invalid file extension");
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

        // Check if the file is HTML and apply sanitization if needed
        if ("html".equals(extensionLower) || "htm".equals(extensionLower)) {
            // Read and sanitize HTML content
            String htmlContent = new String(inputFile.getBytes(), StandardCharsets.UTF_8);
            String sanitizedHtml = customHtmlSanitizer.sanitize(htmlContent);
            Files.writeString(inputPath, sanitizedHtml, StandardCharsets.UTF_8);
        } else {
            // copy file content
            Files.copy(inputFile.getInputStream(), inputPath, StandardCopyOption.REPLACE_EXISTING);
        }

        Path libreOfficeProfile = null;
        try {
            ProcessExecutorResult result;
            // Run Unoconvert command
            if (isUnoconvertAvailable()) {
                // Unoconvert: schreibe direkt in outputPath innerhalb des workDir
                List<String> command = new ArrayList<>();
                command.add(runtimePathConfig.getUnoConvertPath());
                command.add("--port");
                command.add("2003");
                command.add("--convert-to");
                command.add("pdf");
                command.add(inputPath.toString());
                command.add(outputPath.toString());

                result =
                        ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE)
                                .runCommandWithOutputHandling(command);
            } // Run soffice command
            else {
                libreOfficeProfile = Files.createTempDirectory("libreoffice_profile_");
                List<String> command = new ArrayList<>();
                command.add(runtimePathConfig.getSOfficePath());
                command.add("-env:UserInstallation=" + libreOfficeProfile.toUri().toString());
                command.add("--headless");
                command.add("--nologo");
                command.add("--convert-to");
                command.add("pdf:writer_pdf_Export");
                command.add("--outdir");
                command.add(workDir.toString());
                command.add(inputPath.toString());

                result =
                        ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE)
                                .runCommandWithOutputHandling(command);
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

    private boolean isValidFileExtension(String fileExtension) {
        return RegexPatternUtils.getInstance()
                .getFileExtensionValidationPattern()
                .matcher(fileExtension)
                .matches();
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/file/pdf")
    @Operation(
            summary = "Convert a file to a PDF using LibreOffice",
            description =
                    "This endpoint converts a given file to a PDF using LibreOffice API  Input:ANY"
                            + " Output:PDF Type:SISO")
    public ResponseEntity<byte[]> processFileToPDF(@ModelAttribute GeneralFile generalFile)
            throws Exception {
        MultipartFile inputFile = generalFile.getFileInput();
        // unused but can start server instance if startup time is to long
        // LibreOfficeListener.getInstance().start();
        File file = null;
        try {
            file = convertToPdf(inputFile);

            PDDocument doc = pdfDocumentFactory.load(file);
            return WebResponseUtils.pdfDocToWebResponse(
                    doc,
                    GeneralUtils.generateFilename(
                            inputFile.getOriginalFilename(), "_convertedToPDF.pdf"));
        } finally {
            if (file != null && file.getParent() != null) {
                FileUtils.deleteDirectory(file.getParentFile());
            }
        }
    }
}
