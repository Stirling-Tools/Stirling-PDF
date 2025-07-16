package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

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
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
@Slf4j
@RequiredArgsConstructor
public class RepairController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final EndpointConfiguration endpointConfiguration;

    private boolean isGhostscriptEnabled() {
        return endpointConfiguration.isGroupEnabled("Ghostscript");
    }

    private boolean isQpdfEnabled() {
        return endpointConfiguration.isGroupEnabled("qpdf");
    }

    @PostMapping(consumes = "multipart/form-data", value = "/repair")
    @Operation(
            summary = "Repair a PDF file",
            description =
                    "This endpoint repairs a given PDF file by running Ghostscript (primary), qpdf (fallback), or PDFBox (if no external tools available). The PDF is"
                            + " first saved to a temporary location, repaired, read back, and then"
                            + " returned as a response. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> repairPdf(@ModelAttribute PDFFile file)
            throws IOException, InterruptedException {
        MultipartFile inputFile = file.getFileInput();

        // Use TempFile with try-with-resources for automatic cleanup
        try (TempFile tempInputFile = new TempFile(tempFileManager, ".pdf");
                TempFile tempOutputFile = new TempFile(tempFileManager, ".pdf")) {

            // Save the uploaded file to the temporary location
            inputFile.transferTo(tempInputFile.getFile());

            boolean repairSuccess = false;

            // Try Ghostscript first if available
            if (isGhostscriptEnabled()) {
                try {
                    List<String> gsCommand = new ArrayList<>();
                    gsCommand.add("gs");
                    gsCommand.add("-o");
                    gsCommand.add(tempOutputFile.getPath().toString());
                    gsCommand.add("-sDEVICE=pdfwrite");
                    gsCommand.add(tempInputFile.getPath().toString());

                    ProcessExecutorResult gsResult =
                            ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT)
                                    .runCommandWithOutputHandling(gsCommand);

                    if (gsResult.getRc() == 0) {
                        repairSuccess = true;
                    }
                } catch (Exception e) {
                    // Log and continue to QPDF fallback
                    log.warn("Ghostscript repair failed, trying QPDF fallback: ", e);
                }
            }

            // Fallback to QPDF if Ghostscript failed or not available
            if (!repairSuccess && isQpdfEnabled()) {
                List<String> qpdfCommand = new ArrayList<>();
                qpdfCommand.add("qpdf");
                qpdfCommand.add("--replace-input"); // Automatically fixes problems it can
                qpdfCommand.add("--qdf"); // Linearizes and normalizes PDF structure
                qpdfCommand.add("--object-streams=disable"); // Can help with some corruptions
                qpdfCommand.add(tempInputFile.getPath().toString());
                qpdfCommand.add(tempOutputFile.getPath().toString());

                ProcessExecutorResult qpdfResult =
                        ProcessExecutor.getInstance(ProcessExecutor.Processes.QPDF)
                                .runCommandWithOutputHandling(qpdfCommand);

                repairSuccess = true;
            }

            // Use PDFBox as last resort if no external tools are available
            if (!repairSuccess) {
                if (!isGhostscriptEnabled() && !isQpdfEnabled()) {
                    // Basic PDFBox repair - load and save to fix structural issues
                    try (var document = pdfDocumentFactory.load(tempInputFile.getFile())) {
                        document.save(tempOutputFile.getFile());
                        repairSuccess = true;
                    }
                } else {
                    throw new IOException("PDF repair failed with available tools");
                }
            }

            // Read the repaired PDF file
            byte[] pdfBytes = pdfDocumentFactory.loadToBytes(tempOutputFile.getFile());

            // Return the repaired PDF as a response
            String outputFilename =
                    Filenames.toSimpleFileName(inputFile.getOriginalFilename())
                                    .replaceFirst("[.][^.]+$", "")
                            + "_repaired.pdf";
            return WebResponseUtils.bytesToWebResponse(pdfBytes, outputFilename);
        }
    }
}
