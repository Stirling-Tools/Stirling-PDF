package stirling.software.SPDF.controller.api.converters;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.apache.commons.io.FileUtils;
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

import stirling.software.SPDF.model.api.converters.PdfToPdfARequest;
import stirling.software.SPDF.utils.ProcessExecutor;
import stirling.software.SPDF.utils.ProcessExecutor.ProcessExecutorResult;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/convert")
@Slf4j
@Tag(name = "Convert", description = "Convert APIs")
public class ConvertPDFToPDFA {

    @PostMapping(consumes = "multipart/form-data", value = "/pdf/pdfa")
    @Operation(
            summary = "Convert a PDF to a PDF/A",
            description =
                    "This endpoint converts a PDF file to a PDF/A file using LibreOffice. PDF/A is a format designed for long-term archiving of digital documents. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> pdfToPdfA(@ModelAttribute PdfToPdfARequest request)
            throws Exception {
        MultipartFile inputFile = request.getFileInput();
        String outputFormat = request.getOutputFormat();

        // Validate input file type
        if (!"application/pdf".equals(inputFile.getContentType())) {
            log.error("Invalid input file type: {}", inputFile.getContentType());
            throw new IllegalArgumentException("Input file must be a PDF");
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
        Path tempOutputDir = null;
        byte[] fileBytes;

        try {
            // Save uploaded file to temp location
            tempInputFile = Files.createTempFile("input_", ".pdf");
            inputFile.transferTo(tempInputFile);

            // Create temp output directory
            tempOutputDir = Files.createTempDirectory("output_");

            // Determine PDF/A filter based on requested format
            String pdfFilter =
                    "pdfa".equals(outputFormat)
                            ? "pdf:writer_pdf_Export:{\"SelectPdfVersion\":{\"type\":\"long\",\"value\":\"2\"}}"
                            : "pdf:writer_pdf_Export:{\"SelectPdfVersion\":{\"type\":\"long\",\"value\":\"1\"}}";

            // Prepare LibreOffice command
            List<String> command =
                    new ArrayList<>(
                            Arrays.asList(
                                    "soffice",
                                    "--headless",
                                    "--nologo",
                                    "--convert-to",
                                    pdfFilter,
                                    "--outdir",
                                    tempOutputDir.toString(),
                                    tempInputFile.toString()));

            ProcessExecutorResult returnCode =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE)
                            .runCommandWithOutputHandling(command);

            if (returnCode.getRc() != 0) {
                log.error("PDF/A conversion failed with return code: {}", returnCode.getRc());
                throw new RuntimeException("PDF/A conversion failed");
            }

            // Get the output file
            File[] outputFiles = tempOutputDir.toFile().listFiles();
            if (outputFiles == null || outputFiles.length != 1) {
                throw new RuntimeException(
                        "Expected exactly one output file but found "
                                + (outputFiles == null ? "none" : outputFiles.length));
            }

            fileBytes = FileUtils.readFileToByteArray(outputFiles[0]);
            String outputFilename = baseFileName + "_PDFA.pdf";

            return WebResponseUtils.bytesToWebResponse(
                    fileBytes, outputFilename, MediaType.APPLICATION_PDF);

        } finally {
            // Clean up temporary files
            if (tempInputFile != null) {
                Files.deleteIfExists(tempInputFile);
            }
            if (tempOutputDir != null) {
                FileUtils.deleteDirectory(tempOutputDir.toFile());
            }
        }
    }
}
