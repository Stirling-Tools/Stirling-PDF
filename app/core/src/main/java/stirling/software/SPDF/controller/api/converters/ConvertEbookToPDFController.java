package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

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
import stirling.software.SPDF.model.api.converters.ConvertEbookToPdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/convert")
@Tag(name = "Convert", description = "Convert APIs")
@RequiredArgsConstructor
@Slf4j
public class ConvertEbookToPDFController {

    private static final Set<String> SUPPORTED_EXTENSIONS =
            Set.of("epub", "mobi", "azw3", "fb2", "txt", "docx");

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final EndpointConfiguration endpointConfiguration;

    private boolean isCalibreEnabled() {
        return endpointConfiguration.isGroupEnabled("Calibre");
    }

    private boolean isGhostscriptEnabled() {
        return endpointConfiguration.isGroupEnabled("Ghostscript");
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/ebook/pdf")
    @Operation(
            summary = "Convert an eBook file to PDF",
            description =
                    "This endpoint converts common eBook formats (EPUB, MOBI, AZW3, FB2, TXT, DOCX)"
                            + " to PDF using Calibre. Input:BOOK Output:PDF Type:SISO")
    public ResponseEntity<byte[]> convertEbookToPdf(
            @ModelAttribute ConvertEbookToPdfRequest request) throws Exception {
        if (!isCalibreEnabled()) {
            throw new IllegalStateException("Calibre support is disabled");
        }

        MultipartFile inputFile = request.getFileInput();
        if (inputFile == null || inputFile.isEmpty()) {
            throw new IllegalArgumentException("No input file provided");
        }

        boolean optimizeForEbook = Boolean.TRUE.equals(request.getOptimizeForEbook());
        if (optimizeForEbook && !isGhostscriptEnabled()) {
            log.warn(
                    "Ghostscript optimization requested but Ghostscript is not enabled/available"
                            + " for ebook conversion");
            optimizeForEbook = false;
        }
        boolean embedAllFonts = Boolean.TRUE.equals(request.getEmbedAllFonts());
        boolean includeTableOfContents = Boolean.TRUE.equals(request.getIncludeTableOfContents());
        boolean includePageNumbers = Boolean.TRUE.equals(request.getIncludePageNumbers());

        String originalFilename = Filenames.toSimpleFileName(inputFile.getOriginalFilename());
        if (originalFilename == null || originalFilename.isBlank()) {
            originalFilename = "document";
        }

        String extension = FilenameUtils.getExtension(originalFilename);
        if (extension == null || extension.isBlank()) {
            throw new IllegalArgumentException("Unable to determine file type");
        }

        String lowerExtension = extension.toLowerCase(Locale.ROOT);
        if (!SUPPORTED_EXTENSIONS.contains(lowerExtension)) {
            throw new IllegalArgumentException("Unsupported eBook file extension: " + extension);
        }

        String baseName = FilenameUtils.getBaseName(originalFilename);
        if (baseName == null || baseName.isBlank()) {
            baseName = "document";
        }

        Path workingDirectory = tempFileManager.createTempDirectory();
        Path inputPath = workingDirectory.resolve(baseName + "." + lowerExtension);
        Path outputPath = workingDirectory.resolve(baseName + ".pdf");

        try (InputStream inputStream = inputFile.getInputStream()) {
            Files.copy(inputStream, inputPath, StandardCopyOption.REPLACE_EXISTING);
        }

        List<String> command =
                buildCalibreCommand(
                        inputPath,
                        outputPath,
                        embedAllFonts,
                        includeTableOfContents,
                        includePageNumbers);
        ProcessExecutorResult result =
                ProcessExecutor.getInstance(ProcessExecutor.Processes.CALIBRE)
                        .runCommandWithOutputHandling(command, workingDirectory.toFile());

        if (result == null) {
            throw new IllegalStateException("Calibre conversion returned no result");
        }

        if (result.getRc() != 0) {
            String errorMessage = result.getMessages();
            if (errorMessage == null || errorMessage.isBlank()) {
                errorMessage = "Calibre conversion failed";
            }
            throw new IllegalStateException(errorMessage);
        }

        if (!Files.exists(outputPath) || Files.size(outputPath) == 0L) {
            throw new IllegalStateException("Calibre did not produce a PDF output");
        }

        String outputFilename =
                GeneralUtils.generateFilename(originalFilename, "_convertedToPDF.pdf");

        try {
            if (optimizeForEbook) {
                byte[] pdfBytes = Files.readAllBytes(outputPath);
                try {
                    byte[] optimizedPdf = GeneralUtils.optimizePdfWithGhostscript(pdfBytes);
                    return WebResponseUtils.bytesToWebResponse(optimizedPdf, outputFilename);
                } catch (IOException e) {
                    log.warn(
                            "Ghostscript optimization failed for ebook conversion, returning"
                                    + " original PDF",
                            e);
                    return WebResponseUtils.bytesToWebResponse(pdfBytes, outputFilename);
                }
            }

            try (PDDocument document = pdfDocumentFactory.load(outputPath.toFile())) {
                return WebResponseUtils.pdfDocToWebResponse(document, outputFilename);
            }
        } finally {
            cleanupTempFiles(workingDirectory, inputPath, outputPath);
        }
    }

    private List<String> buildCalibreCommand(
            Path inputPath,
            Path outputPath,
            boolean embedAllFonts,
            boolean includeTableOfContents,
            boolean includePageNumbers) {
        List<String> command = new ArrayList<>();
        command.add("ebook-convert");
        command.add(inputPath.toString());
        command.add(outputPath.toString());

        if (embedAllFonts) {
            command.add("--embed-all-fonts");
        }
        if (includeTableOfContents) {
            command.add("--pdf-add-toc");
        }
        if (includePageNumbers) {
            command.add("--pdf-page-numbers");
        }

        return command;
    }

    private void cleanupTempFiles(Path workingDirectory, Path inputPath, Path outputPath) {
        List<Path> pathsToDelete = new ArrayList<>();
        pathsToDelete.add(inputPath);
        pathsToDelete.add(outputPath);

        for (Path path : pathsToDelete) {
            try {
                Files.deleteIfExists(path);
            } catch (IOException e) {
                log.warn("Failed to delete temporary file: {}", path, e);
            }
        }
        tempFileManager.deleteTempDirectory(workingDirectory);
    }
}
