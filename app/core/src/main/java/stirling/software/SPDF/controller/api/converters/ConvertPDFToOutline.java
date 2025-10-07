package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

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

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.converters.PdfToOutlineRequest;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/convert")
@Slf4j
@Tag(name = "Convert", description = "Convert APIs")
public class ConvertPDFToOutline {

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/pdf/outline")
    @Operation(
            summary = "Add outline/bookmarks to a PDF",
            description =
                    "This endpoint adds an outline/bookmarks to a PDF file using AI-powered analysis. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> pdfToOutline(@ModelAttribute PdfToOutlineRequest request)
            throws Exception {
        MultipartFile inputFile = request.getFileInput();

        // Validate input file type
        if (!MediaType.APPLICATION_PDF_VALUE.equals(inputFile.getContentType())) {
            log.error("Invalid input file type: {}", inputFile.getContentType());
            throw ExceptionUtils.createPdfFileRequiredException();
        }

        // Get the original filename without extension
        String originalFileName = Filenames.toSimpleFileName(inputFile.getOriginalFilename());
        if (originalFileName == null || originalFileName.trim().isEmpty()) {
            originalFileName = "output.pdf";
        }
        String baseFileName =
                originalFileName.contains(".")
                        ? originalFileName.substring(0, originalFileName.lastIndexOf('.'))
                        : originalFileName;

        Path tempInputFile = null;
        Path tempOutputFile = null;
        byte[] fileBytes;

        try {
            // Save uploaded file to temp location
            tempInputFile = Files.createTempFile("input_", ".pdf");
            inputFile.transferTo(tempInputFile);

            // Create temp output file
            tempOutputFile = Files.createTempFile("output_", ".pdf");

            // Run pdf_outliner
            ProcessExecutorResult result = runPdfOutliner(tempInputFile, tempOutputFile);

            if (result.getRc() != 0) {
                log.error("PDF outlining failed with return code: {}", result.getRc());
                throw new IOException("PDF outlining failed: " + result.getMessages());
            }

            // Read the output file
            fileBytes = Files.readAllBytes(tempOutputFile);

            String outputFilename = baseFileName + "_outlined.pdf";

            return WebResponseUtils.bytesToWebResponse(
                    fileBytes, outputFilename, MediaType.APPLICATION_PDF);

        } finally {
            // Clean up temporary files
            if (tempInputFile != null) {
                Files.deleteIfExists(tempInputFile);
            }
            if (tempOutputFile != null) {
                Files.deleteIfExists(tempOutputFile);
            }
        }
    }

    private ProcessExecutorResult runPdfOutliner(Path inputFile, Path outputFile)
            throws IOException, InterruptedException {
        // Prepare command: uvx --from git+https://github.com/daniel-eder/pdf-outliner.git
        // pdf-outliner input.pdf -o output.pdf
        List<String> command = new ArrayList<>();
        command.add("uvx");
        command.add("--from");
        command.add("git+https://github.com/daniel-eder/pdf-outliner.git");
        command.add("pdf-outliner");
        command.add(inputFile.toString());
        command.add("-o");
        command.add(outputFile.toString());

        ProcessExecutorResult result =
                ProcessExecutor.getInstance(ProcessExecutor.Processes.PDF_OUTLINER)
                        .runCommandWithOutputHandling(command);

        return result;
    }
}
