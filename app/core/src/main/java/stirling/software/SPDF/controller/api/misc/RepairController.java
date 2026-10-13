package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;

import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.jpdfium.doc.PdfRepair;
import stirling.software.jpdfium.doc.RepairResult;

@MiscApi
@Slf4j
@RequiredArgsConstructor
public class RepairController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final EndpointConfiguration endpointConfiguration;

    /**
     * Flags for {@link PdfRepair#repairFile}: normalize object streams into classic xref tables
     * (matches the old qpdf {@code --object-streams=disable}) and brute-force broken startxref
     * offsets. JPDFium exposes no public constants for these, hence the literals.
     */
    private static final int JPDFIUM_REPAIR_FLAGS = 0x02 | 0x04;

    private boolean isGhostscriptEnabled() {
        return endpointConfiguration.isGroupEnabled("Ghostscript");
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/repair",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @StandardPdfResponse
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Repair a PDF file",
            description =
                    "This endpoint repairs a given PDF file by running Ghostscript (primary), JPDFium"
                            + " (fallback), or PDFBox (last resort). The PDF is first saved"
                            + " to a temporary location, repaired, read back, and then returned as a response.")
    public ResponseEntity<Resource> repairPdf(@ModelAttribute PDFFile file)
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

                    ProcessExecutorResult gsResult =
                            ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT)
                                    .runCommandWithOutputHandling(gsCommand);

                    if (gsResult.getRc() == 0) {
                        repairSuccess = true;
                    }
                } catch (Exception e) {
                    // Log and continue to the JPDFium fallback
                    log.warn("Ghostscript repair failed, trying JPDFium fallback: ", e);
                }
            }

            // Fallback to JPDFium if Ghostscript failed or is not available. Its core stage
            // runs the same recovery the qpdf CLI performed (tolerant open, qpdf recovery,
            // startxref fix) in-process, so no external binary is needed.
            if (!repairSuccess) {
                try {
                    RepairResult.Status status =
                            PdfRepair.repairFile(
                                    tempInputFile.getPath(),
                                    tempOutputFile.getPath(),
                                    JPDFIUM_REPAIR_FLAGS);
                    repairSuccess =
                            status != RepairResult.Status.FAILED
                                    && Files.size(tempOutputFile.getPath()) > 0;
                } catch (RuntimeException | IOException e) {
                    // JPDFium declined the file; fall through to the PDFBox last resort.
                    log.warn("JPDFium repair failed: ", e);
                }
            }

            // PDFBox last resort, never gated: Ghostscript is opportunistic, not required.
            if (!repairSuccess) {
                // Basic PDFBox repair - load and save to fix structural issues
                try (var document = pdfDocumentFactory.load(tempInputFile.getFile())) {
                    document.save(tempOutputFile.getFile());
                    repairSuccess = true;
                }
            }

            // Return the repaired PDF as a streaming response
            return WebResponseUtils.pdfFileToWebResponse(
                    tempOutputFile,
                    GeneralUtils.generateFilename(
                            inputFile.getOriginalFilename(), "_repaired.pdf"));
        } catch (IOException e) {
            tempOutputFile.close();
            throw e;
        } catch (RuntimeException e) {
            tempOutputFile.close();
            throw e;
        }
    }
}
