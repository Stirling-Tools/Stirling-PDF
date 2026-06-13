package stirling.software.SPDF.service.misc;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class RepairServiceImpl implements RepairService {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final EndpointConfiguration endpointConfiguration;

    private boolean isGhostscriptEnabled() {
        return endpointConfiguration.isGroupEnabled("Ghostscript");
    }

    private boolean isQpdfEnabled() {
        return endpointConfiguration.isGroupEnabled("qpdf");
    }

    @Override
    public ResponseEntity<Resource> repairPdf(PDFFile file)
            throws IOException, InterruptedException {

        MultipartFile inputFile = file.getFileInput();

        TempFile tempOutputFile = new TempFile(tempFileManager, ".pdf");
        try (TempFile tempInputFile = new TempFile(tempFileManager, ".pdf")) {

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

                    ProcessExecutor.ProcessExecutorResult gsResult =
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

                ProcessExecutor.ProcessExecutorResult qpdfResult =
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
        } catch (IOException | InterruptedException | RuntimeException e) {
            tempOutputFile.close();
            throw e;
        }
    }
}
