package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.model.api.PDFFile;
import stirling.software.SPDF.service.CustomPDDocumentFactory;
import stirling.software.SPDF.utils.ProcessExecutor;
import stirling.software.SPDF.utils.ProcessExecutor.ProcessExecutorResult;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
public class RepairController {

    private static final Logger logger = LoggerFactory.getLogger(RepairController.class);

    private final CustomPDDocumentFactory pdfDocumentFactory;

    @Autowired
    public RepairController(CustomPDDocumentFactory pdfDocumentFactory) {
        this.pdfDocumentFactory = pdfDocumentFactory;
    }

    @PostMapping(consumes = "multipart/form-data", value = "/repair")
    @Operation(
            summary = "Repair a PDF file",
            description =
                    "This endpoint repairs a given PDF file by running qpdf command. The PDF is first saved to a temporary location, repaired, read back, and then returned as a response. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> repairPdf(@ModelAttribute PDFFile request)
            throws IOException, InterruptedException {
        MultipartFile inputFile = request.getFileInput();
        // Save the uploaded file to a temporary location
        Path tempInputFile = Files.createTempFile("input_", ".pdf");
        byte[] pdfBytes = null;
        inputFile.transferTo(tempInputFile.toFile());
        try {

            List<String> command = new ArrayList<>();
            command.add("qpdf");
            command.add("--replace-input"); // Automatically fixes problems it can
            command.add("--qdf"); // Linearizes and normalizes PDF structure
            command.add("--object-streams=disable"); // Can help with some corruptions
            command.add(tempInputFile.toString());

            ProcessExecutorResult returnCode =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.QPDF)
                            .runCommandWithOutputHandling(command);

            // Read the optimized PDF file
            pdfBytes = pdfDocumentFactory.loadToBytes(tempInputFile.toFile());

            // Return the optimized PDF as a response
            String outputFilename =
                    Filenames.toSimpleFileName(inputFile.getOriginalFilename())
                                    .replaceFirst("[.][^.]+$", "")
                            + "_repaired.pdf";
            return WebResponseUtils.bytesToWebResponse(pdfBytes, outputFilename);
        } finally {
            // Clean up the temporary files
            Files.deleteIfExists(tempInputFile);
        }
    }
}
