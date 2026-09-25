package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
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
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@MiscApi
@RequiredArgsConstructor
@Slf4j
public class TextToOutlinesController {

    private final TempFileManager tempFileManager;
    private final EndpointConfiguration endpointConfiguration;

    @AutoJobPostMapping(
            value = "/text-to-outlines",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Convert text to outlines",
            description =
                    "Converts all text in the PDF to vector outlines using Ghostscript"
                            + " (-dNoOutputFonts), removing font dependencies for prepress"
                            + " workflows.")
    public ResponseEntity<Resource> textToOutlines(@ModelAttribute PDFFile request)
            throws IOException {
        if (!endpointConfiguration.isGroupEnabled("Ghostscript")) {
            throw ExceptionUtils.createGhostscriptRequiredException("text-to-outlines");
        }
        MultipartFile inputFile = request.getFileInput();
        if (inputFile == null || inputFile.isEmpty()) {
            throw ExceptionUtils.createFileNullOrEmptyException();
        }

        TempFile tempOutputFile = null;
        try (TempFile tempInputFile = tempFileManager.createManagedTempFile(".pdf")) {
            inputFile.transferTo(tempInputFile.getFile());
            tempOutputFile = tempFileManager.createManagedTempFile(".pdf");

            ProcessExecutor processExecutor =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT);
            List<String> command =
                    List.of(
                            "gs",
                            "-sDEVICE=pdfwrite",
                            "-dCompatibilityLevel=1.5",
                            "-dNoOutputFonts",
                            "-dNOPAUSE",
                            "-dQUIET",
                            "-dBATCH",
                            "-o",
                            tempOutputFile.getAbsolutePath(),
                            tempInputFile.getAbsolutePath());

            try {
                ProcessExecutorResult result =
                        processExecutor.runCommandWithOutputHandling(command);
                String gsOutput = result.getMessages();
                ExceptionUtils.GhostscriptException criticalError =
                        ExceptionUtils.detectGhostscriptCriticalError(gsOutput);
                if (criticalError != null) {
                    throw criticalError;
                }
                if (result.getRc() != 0) {
                    throw ExceptionUtils.createGhostscriptCompressionException(gsOutput);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw ExceptionUtils.createProcessingInterruptedException("Ghostscript", e);
            }

            TempFile out = tempOutputFile;
            tempOutputFile = null; // ownership transferred to response Resource
            return WebResponseUtils.pdfFileToWebResponse(
                    out,
                    GeneralUtils.generateFilename(
                            inputFile.getOriginalFilename(), "_outlined.pdf"));
        } finally {
            if (tempOutputFile != null) {
                tempOutputFile.close();
            }
        }
    }
}
