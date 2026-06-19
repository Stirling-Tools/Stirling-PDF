package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.swagger.v3.oas.annotations.Operation;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@MiscApi
@Path("/api/v1/misc")
@ApplicationScoped
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

    @POST
    @Path("/repair")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/repair",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @StandardPdfResponse
    @Operation(
            summary = "Repair a PDF file",
            description =
                    "This endpoint repairs a given PDF file by running Ghostscript (primary), qpdf (fallback), or PDFBox (if no external tools available). The PDF is"
                            + " first saved to a temporary location, repaired, read back, and then"
                            + " returned as a response. Input:PDF Output:PDF Type:SISO")
    public Response repairPdf(
            @RestForm("fileInput") FileUpload fileUpload, @RestForm("fileId") String fileId)
            throws IOException, InterruptedException {
        PDFFile file = new PDFFile();
        file.setFileInput(FileUploadMultipartFile.of(fileUpload));
        file.setFileId(fileId);

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
