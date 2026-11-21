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
import stirling.software.SPDF.model.api.converters.ConvertEbookToPdfRequest;
import stirling.software.SPDF.service.OfficeToPdfService;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.OfficeDocumentSanitizer;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ConvertApi
@RequiredArgsConstructor
@Slf4j
public class ConvertEbookToPDFController {

    private static final Set<String> SUPPORTED_EXTENSIONS =
            Set.of("epub", "mobi", "azw3", "fb2", "txt", "docx");

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final EndpointConfiguration endpointConfiguration;
    private final OfficeDocumentSanitizer officeDocumentSanitizer;
    private final OfficeToPdfService officeToPdfService;

    private boolean isGhostscriptEnabled() {
        return endpointConfiguration.isGroupEnabled("Ghostscript");
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/ebook/pdf",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @ToolIO(accepts = ToolFormat.EBOOK, produces = ToolFormat.PDF)
    @Operation(
            summary = "Convert an eBook file to PDF",
            description =
                    "This endpoint converts common eBook formats (EPUB, MOBI, AZW3, FB2, TXT, DOCX)"
                            + " to PDF using Stirling Office Convert.")
    public ResponseEntity<Resource> convertEbookToPdf(
            @ModelAttribute ConvertEbookToPdfRequest request) throws Exception {
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
        try {

            if (officeDocumentSanitizer.isSanitizableExtension(lowerExtension)) {
                byte[] sanitized;
                try {
                    sanitized =
                            officeDocumentSanitizer.sanitize(inputFile.getBytes(), lowerExtension);
                } catch (IOException e) {
                    OfficeToPdfService.rejectUnreadable(e);
                    throw e;
                }
                Files.write(inputPath, sanitized);
            } else {
                try (InputStream inputStream = inputFile.getInputStream()) {
                    Files.copy(inputStream, inputPath, StandardCopyOption.REPLACE_EXISTING);
                }
            }

            officeToPdfService.convert(
                    inputPath,
                    outputPath,
                    officeToPdfService
                            .options()
                            .tableOfContents(includeTableOfContents)
                            .pageNumbers(includePageNumbers));

            if (!Files.exists(outputPath) || Files.size(outputPath) == 0L) {
                throw new IllegalStateException("The ebook converter did not produce a PDF output");
            }

            String outputFilename = GeneralUtils.generateFilename(originalFilename, ".pdf");

            TempFile tempOut = null;
            try {
                tempOut = tempFileManager.createManagedTempFile(".pdf");
                if (optimizeForEbook) {
                    byte[] pdfBytes = Files.readAllBytes(outputPath);
                    try {
                        byte[] optimizedPdf = GeneralUtils.optimizePdfWithGhostscript(pdfBytes);
                        Files.write(tempOut.getPath(), optimizedPdf);
                    } catch (IOException e) {
                        log.warn(
                                "Ghostscript optimization failed for ebook conversion, returning"
                                        + " original PDF",
                                e);
                        Files.write(tempOut.getPath(), pdfBytes);
                    }
                } else {
                    try (PDDocument document = pdfDocumentFactory.load(outputPath.toFile())) {
                        document.save(tempOut.getFile());
                    }
                }
                ResponseEntity<Resource> response =
                        WebResponseUtils.pdfFileToWebResponse(tempOut, outputFilename);
                tempOut = null;
                return response;
            } catch (Exception e) {
                if (tempOut != null) {
                    tempOut.close();
                }
                throw e;
            }
        } finally {
            cleanupTempFiles(workingDirectory, inputPath, outputPath);
        }
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
