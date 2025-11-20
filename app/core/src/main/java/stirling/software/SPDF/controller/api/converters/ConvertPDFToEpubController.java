package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;

import org.apache.commons.io.FilenameUtils;
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
import stirling.software.SPDF.model.api.converters.ConvertPdfToEpubRequest;
import stirling.software.SPDF.model.api.converters.ConvertPdfToEpubRequest.TargetDevice;
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
public class ConvertPDFToEpubController {

    private static final String CALIBRE_GROUP = "Calibre";
    private static final String DEFAULT_EXTENSION = "pdf";
    private static final MediaType EPUB_MEDIA_TYPE = MediaType.valueOf("application/epub+zip");
    private static final String FILTERED_CSS =
            "font-family,color,background-color,margin-left,margin-right";
    private static final String SMART_CHAPTER_EXPRESSION =
            "//h:*[re:test(., '\\s*Chapter\\s+', 'i')]";

    private final TempFileManager tempFileManager;
    private final EndpointConfiguration endpointConfiguration;

    private static List<String> buildCalibreCommand(
            Path inputPath, Path outputPath, boolean detectChapters, TargetDevice targetDevice) {
        List<String> command = new ArrayList<>();
        command.add("ebook-convert");
        command.add(inputPath.toString());
        command.add(outputPath.toString());

        // Golden defaults
        command.add("--enable-heuristics");
        command.add("--insert-blank-line");
        command.add("--filter-css");
        command.add(FILTERED_CSS);

        if (detectChapters) {
            command.add("--chapter");
            command.add(SMART_CHAPTER_EXPRESSION);
        }

        if (targetDevice != null) {
            command.add("--output-profile");
            command.add(targetDevice.getCalibreProfile());
        }

        return command;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/pdf/epub")
    @Operation(
            summary = "Convert PDF to EPUB",
            description =
                    "Convert a PDF file to a high-quality EPUB ebook using Calibre. Input:PDF"
                            + " Output:EPUB Type:SISO")
    public ResponseEntity<byte[]> convertPdfToEpub(@ModelAttribute ConvertPdfToEpubRequest request)
            throws Exception {

        if (!endpointConfiguration.isGroupEnabled(CALIBRE_GROUP)) {
            throw new IllegalStateException(
                    "Calibre support is disabled. Enable the Calibre group or install Calibre to use"
                            + " this feature.");
        }

        MultipartFile inputFile = request.getFileInput();
        if (inputFile == null || inputFile.isEmpty()) {
            throw new IllegalArgumentException("No input file provided");
        }

        boolean detectChapters = !Boolean.FALSE.equals(request.getDetectChapters());
        TargetDevice targetDevice =
                request.getTargetDevice() == null
                        ? TargetDevice.TABLET_PHONE_IMAGES
                        : request.getTargetDevice();

        String originalFilename = Filenames.toSimpleFileName(inputFile.getOriginalFilename());
        if (originalFilename == null || originalFilename.isBlank()) {
            originalFilename = "document." + DEFAULT_EXTENSION;
        }

        String extension = FilenameUtils.getExtension(originalFilename);
        if (extension == null || extension.isBlank()) {
            throw new IllegalArgumentException("Unable to determine file type");
        }

        if (!DEFAULT_EXTENSION.equalsIgnoreCase(extension)) {
            throw new IllegalArgumentException("Input file must be a PDF");
        }

        String baseName = FilenameUtils.getBaseName(originalFilename);
        if (baseName == null || baseName.isBlank()) {
            baseName = "document";
        }

        Path workingDirectory = null;
        Path inputPath = null;
        Path outputPath = null;

        try {
            workingDirectory = tempFileManager.createTempDirectory();
            inputPath = workingDirectory.resolve(baseName + "." + DEFAULT_EXTENSION);
            outputPath = workingDirectory.resolve(baseName + ".epub");

            try (InputStream inputStream = inputFile.getInputStream()) {
                Files.copy(inputStream, inputPath, StandardCopyOption.REPLACE_EXISTING);
            }

            List<String> command =
                    buildCalibreCommand(inputPath, outputPath, detectChapters, targetDevice);
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
                throw new IllegalStateException("Calibre did not produce an EPUB output");
            }

            String outputFilename =
                    GeneralUtils.generateFilename(originalFilename, "_convertedToEPUB.epub");

            byte[] epubBytes = Files.readAllBytes(outputPath);
            return WebResponseUtils.bytesToWebResponse(epubBytes, outputFilename, EPUB_MEDIA_TYPE);
        } finally {
            cleanupTempFiles(workingDirectory, inputPath, outputPath);
        }
    }

    private void cleanupTempFiles(Path workingDirectory, Path inputPath, Path outputPath) {
        if (workingDirectory == null) {
            return;
        }
        List<Path> pathsToDelete = new ArrayList<>();
        if (inputPath != null) {
            pathsToDelete.add(inputPath);
        }
        if (outputPath != null) {
            pathsToDelete.add(outputPath);
        }
        for (Path path : pathsToDelete) {
            try {
                Files.deleteIfExists(path);
            } catch (IOException e) {
                log.warn("Failed to delete temporary file: {}", path, e);
            }
        }

        try {
            tempFileManager.deleteTempDirectory(workingDirectory);
        } catch (Exception e) {
            log.warn("Failed to delete temporary directory: {}", workingDirectory, e);
        }
    }
}
