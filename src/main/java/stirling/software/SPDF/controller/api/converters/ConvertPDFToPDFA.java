package stirling.software.SPDF.controller.api.converters;

import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

import stirling.software.SPDF.model.api.converters.PdfToPdfARequest;
import stirling.software.SPDF.utils.ProcessExecutor;
import stirling.software.SPDF.utils.ProcessExecutor.ProcessExecutorResult;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/convert")
@Tag(name = "Convert", description = "Convert APIs")
public class ConvertPDFToPDFA {

    private static final Logger logger = LoggerFactory.getLogger(ConvertPDFToPDFA.class);

    @PostMapping(consumes = "multipart/form-data", value = "/pdf/pdfa")
    @Operation(
            summary = "Convert a PDF to a PDF/A",
            description =
                    "This endpoint converts a PDF file to a PDF/A file. PDF/A is a format designed for long-term archiving of digital documents. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> pdfToPdfA(@ModelAttribute PdfToPdfARequest request)
            throws Exception {
        MultipartFile inputFile = request.getFileInput();
        String outputFormat = request.getOutputFormat();

        // Convert MultipartFile to byte[]
        byte[] pdfBytes = inputFile.getBytes();

        // Save the uploaded file to a temporary location
        Path tempInputFile = Files.createTempFile("input_", ".pdf");
        try (OutputStream outputStream = new FileOutputStream(tempInputFile.toFile())) {
            outputStream.write(pdfBytes);
        }

        // Prepare the output file path
        Path tempOutputFile = Files.createTempFile("output_", ".pdf");

        // Prepare the ghostscript command
        List<String> command = new ArrayList<>();
        command.add("gs");
        command.add("-dPDFA=" + ("pdfa".equals(outputFormat) ? "2" : "1"));
        command.add("-dNOPAUSE");
        command.add("-dBATCH");
        command.add("-sColorConversionStrategy=UseDeviceIndependentColor");
        command.add("-sDEVICE=pdfwrite");
        command.add("-dPDFACompatibilityPolicy=2");
        command.add("-o");
        command.add(tempOutputFile.toString());
        command.add(tempInputFile.toString());

        ProcessExecutorResult returnCode =
                ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT)
                        .runCommandWithOutputHandling(command);

        if (returnCode.getRc() != 0) {
            logger.info(
                    outputFormat + " conversion failed with return code: " + returnCode.getRc());
        }

        try {
            byte[] pdfBytesOutput = Files.readAllBytes(tempOutputFile);
            // Return the optimized PDF as a response
            String outputFilename =
                    Filenames.toSimpleFileName(inputFile.getOriginalFilename())
                                    .replaceFirst("[.][^.]+$", "")
                            + "_PDFA.pdf";
            return WebResponseUtils.bytesToWebResponse(
                    pdfBytesOutput, outputFilename, MediaType.APPLICATION_PDF);
        } finally {
            // Clean up the temporary files
            Files.deleteIfExists(tempInputFile);
            Files.deleteIfExists(tempOutputFile);
        }
    }
}
