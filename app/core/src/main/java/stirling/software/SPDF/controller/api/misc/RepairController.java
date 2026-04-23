package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.JobProgressService;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@MiscApi
@Slf4j
@RequiredArgsConstructor
public class RepairController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final EndpointConfiguration endpointConfiguration;
    private final JobProgressService jobProgressService;

    private boolean isGhostscriptEnabled() {
        return endpointConfiguration.isGroupEnabled("Ghostscript");
    }

    private boolean isQpdfEnabled() {
        return endpointConfiguration.isGroupEnabled("qpdf");
    }

    @AutoJobPostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/repair")
    @StandardPdfResponse
    @Operation(
            summary = "Repair a PDF file",
            description =
                    "This endpoint repairs a given PDF file by running Ghostscript (primary), qpdf (fallback), or PDFBox (if no external tools available). The PDF is"
                            + " first saved to a temporary location, repaired, read back, and then"
                            + " returned as a response. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<StreamingResponseBody> repairPdf(@ModelAttribute PDFFile file)
            throws IOException, InterruptedException {
        MultipartFile inputFile = file.getFileInput();

        TempFile tempOutputFile = new TempFile(tempFileManager, ".pdf");
        try (TempFile tempInputFile = new TempFile(tempFileManager, ".pdf")) {

            jobProgressService.report(1, "Loading PDF");
            // Save the uploaded file to the temporary location
            inputFile.transferTo(tempInputFile.getFile());

            boolean repairSuccess = false;

            // Try Ghostscript first if available
            if (isGhostscriptEnabled()) {
                try {
                    jobProgressService.report(30, "Running Ghostscript repair");
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
                jobProgressService.report(60, "Running QPDF repair");
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
                    jobProgressService.report(60, "Running PDFBox repair");
                    // Basic PDFBox repair - load and save to fix structural issues
                    try (var document = pdfDocumentFactory.load(tempInputFile.getFile())) {
                        document.save(tempOutputFile.getFile());
                        repairSuccess = true;
                    }
                } else {
                    throw ExceptionUtils.createFileProcessingException(
                            "PDF repair",
                            new IOException("PDF repair failed with available tools"));
                }
            }

            // Return the repaired PDF as a streaming response
            return WebResponseUtils.pdfFileToWebResponse(
                    tempOutputFile,
                    GeneralUtils.generateFilename(
                            inputFile.getOriginalFilename(), "_repaired.pdf"));
        } catch (IOException | InterruptedException e) {
            tempOutputFile.close();
            throw e;
        } catch (RuntimeException e) {
            tempOutputFile.close();
            throw e;
        }
    }
}
