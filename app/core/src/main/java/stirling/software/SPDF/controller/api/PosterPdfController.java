package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.MultiFileResponse;
import stirling.software.SPDF.model.api.general.PosterPdfRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@GeneralApi
@Slf4j
@RequiredArgsConstructor
public class PosterPdfController {

    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            value = "/split-pdf-by-poster",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @MultiFileResponse
    @Operation(
            summary = "Split large PDF pages into smaller printable chunks",
            description =
                    "This endpoint splits large or oddly-sized PDF pages into smaller chunks "
                            + "suitable for printing on standard paper sizes (e.g., A4, Letter). "
                            + "Uses mutool poster to divide each page into a grid of smaller pages. "
                            + "Input: PDF Output: ZIP-PDF Type: SISO")
    public ResponseEntity<byte[]> posterPdf(@ModelAttribute PosterPdfRequest request)
            throws Exception {

        log.debug("Starting PDF poster split process with request: {}", request);
        MultipartFile file = request.getFileInput();

        String filename = GeneralUtils.generateFilename(file.getOriginalFilename(), "");
        log.debug("Base filename for output: {}", filename);

        try (TempFile inputTempFile = new TempFile(tempFileManager, ".pdf");
                TempFile outputTempFile = new TempFile(tempFileManager, ".pdf");
                TempFile zipTempFile = new TempFile(tempFileManager, ".zip")) {

            Path inputPath = inputTempFile.getPath();
            Path outputPath = outputTempFile.getPath();
            Path zipPath = zipTempFile.getPath();

            // Write input file
            log.debug("Writing input file to: {}", inputPath);
            Files.write(inputPath, file.getBytes());

            // Build mutool poster command
            List<String> command = buildMutoolCommand(request, inputPath, outputPath);
            log.info("Executing mutool poster command: {}", String.join(" ", command));

            // Execute mutool poster
            ProcessExecutorResult result =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.MUTOOL)
                            .runCommandWithOutputHandling(command, null);

            if (result.getRc() != 0) {
                log.error("mutool poster failed with exit code: {}", result.getRc());
                log.error("mutool output: {}", result.getMessages());
                throw ExceptionUtils.createIOException(
                        "error.pdfPoster",
                        "Failed to split PDF into poster chunks: {0}",
                        null,
                        result.getMessages());
            }

            log.debug("mutool poster completed successfully");

            // Check if output file was created
            if (!Files.exists(outputPath) || Files.size(outputPath) == 0) {
                log.error("Output file not created or is empty");
                throw ExceptionUtils.createIOException(
                        "error.pdfPoster", "Failed to create poster output file", null);
            }

            // Create ZIP file with the result
            log.debug("Creating ZIP file at: {}", zipPath);
            try (ZipOutputStream zipOut = new ZipOutputStream(Files.newOutputStream(zipPath))) {
                ZipEntry zipEntry = new ZipEntry(filename + "_poster.pdf");
                zipOut.putNextEntry(zipEntry);
                Files.copy(outputPath, zipOut);
                zipOut.closeEntry();
            }

            byte[] data = Files.readAllBytes(zipPath);
            log.debug("Successfully created ZIP with {} bytes", data.length);

            return WebResponseUtils.bytesToWebResponse(
                    data, filename + "_poster.zip", MediaType.APPLICATION_OCTET_STREAM);

        } catch (IOException e) {
            ExceptionUtils.logException("PDF poster split process", e);
            throw e;
        }
    }

    private List<String> buildMutoolCommand(
            PosterPdfRequest request, Path inputPath, Path outputPath) {
        List<String> command = new ArrayList<>();
        command.add("mutool");
        command.add("poster");

        // Add decimation factors
        command.add("-x");
        command.add(String.valueOf(request.getXFactor()));
        command.add("-y");
        command.add(String.valueOf(request.getYFactor()));

        // Add right-to-left flag if requested
        if (request.isRightToLeft()) {
            command.add("-r");
        }

        // Add input and output files
        command.add(inputPath.toString());
        command.add(outputPath.toString());

        return command;
    }
}
