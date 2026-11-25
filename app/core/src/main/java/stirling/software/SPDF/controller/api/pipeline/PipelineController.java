package stirling.software.SPDF.controller.api.pipeline;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.commons.io.FilenameUtils;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.MultiFileResponse;
import stirling.software.SPDF.model.PipelineConfig;
import stirling.software.SPDF.model.PipelineOperation;
import stirling.software.SPDF.model.PipelineResult;
import stirling.software.SPDF.model.api.HandleDataRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.PipelineApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.service.PostHogService;
import stirling.software.common.util.PipelineLimits;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.DatabindException;
import tools.jackson.databind.ObjectMapper;

/** Absent from the desktop bundle for the same reason as {@link PipelineDirectoryProcessor}. */
@PipelineApi
@ConditionalOnProperty(
        name = "STIRLING_PDF_TAURI_MODE",
        havingValue = "false",
        matchIfMissing = true)
@Slf4j
@RequiredArgsConstructor
public class PipelineController {

    private final PipelineProcessor processor;

    private final ObjectMapper objectMapper;

    private final PostHogService postHogService;

    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            value = "/handleData",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @MultiFileResponse
    @Operation(
            summary = "Execute automated PDF processing pipeline",
            description =
                    "This endpoint processes multiple PDF files through a configurable pipeline of operations. "
                            + "Users provide files and a JSON configuration defining the sequence of operations to perform.")
    public ResponseEntity<Resource> handleData(@ModelAttribute HandleDataRequest request)
            throws DatabindException, JacksonException {
        MultipartFile[] files = request.getFileInput();
        String jsonString = request.getJson();
        if (files == null) {
            return null;
        }
        PipelineConfig config = objectMapper.readValue(jsonString, PipelineConfig.class);
        log.info("Received POST request to /handleData with {} files", files.length);

        List<String> operationNames =
                config.getOperations().stream().map(PipelineOperation::getOperation).toList();

        Map<String, Object> properties = new HashMap<>();
        properties.put("operations", operationNames);
        properties.put("fileCount", files.length);

        postHogService.captureEvent("pipeline_api_event", properties);

        List<Resource> inputFiles = null;
        PipelineResult result = null;
        try {
            inputFiles = processor.generateInputFiles(files);
            if (inputFiles == null || inputFiles.isEmpty()) {
                return null;
            }
            result = processor.runPipelineAgainstFiles(inputFiles, config);
            List<Resource> outputFiles = result.getOutputFiles();
            if (outputFiles != null && outputFiles.size() == 1) {
                // If there is only one file, return it directly — stream without int-overflow
                Resource singleFile = outputFiles.get(0);
                TempFile singleTempFile = new TempFile(tempFileManager, ".out");
                try {
                    try (InputStream is = singleFile.getInputStream();
                            OutputStream os = Files.newOutputStream(singleTempFile.getPath())) {
                        is.transferTo(os);
                    }
                    log.info("Returning single file response...");
                    return WebResponseUtils.fileToWebResponse(
                            singleTempFile,
                            singleFile.getFilename(),
                            MediaType.APPLICATION_OCTET_STREAM);
                } catch (Exception e) {
                    singleTempFile.close();
                    throw e;
                }
            } else if (outputFiles == null) {
                return null;
            }
            // Multiple files: stream into a zip TempFile
            TempFile zipTempFile = new TempFile(tempFileManager, ".zip");
            try {
                Set<String> usedNames = new HashSet<>();
                try (ZipOutputStream zipOut =
                        new ZipOutputStream(Files.newOutputStream(zipTempFile.getPath()))) {
                    for (Resource file : outputFiles) {
                        zipOut.putNextEntry(
                                new ZipEntry(uniqueEntryName(file.getFilename(), usedNames)));
                        try (InputStream is = file.getInputStream()) {
                            is.transferTo(zipOut);
                        }
                        zipOut.closeEntry();
                    }
                }
                log.info("Returning zipped file response...");
                return WebResponseUtils.zipFileToWebResponse(zipTempFile, "output.zip");
            } catch (Exception e) {
                zipTempFile.close();
                throw e;
            }
        } catch (PipelineLimits.LimitExceededException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        } catch (Exception e) {
            log.error("Error handling data: ", e);
            return null;
        } finally {
            // The response is a copy, so the uploads and step outputs are not needed any longer
            if (result != null) {
                result.close();
            }
            processor.deleteInputFiles(inputFiles);
        }
    }

    /**
     * The entry's own name, or "name (n).ext" in the same folder once an earlier entry has it.
     * Checked against every emitted name, since an output can already be called "name (1).ext".
     */
    private static String uniqueEntryName(String filename, Set<String> usedNames) {
        String stem = FilenameUtils.removeExtension(filename);
        String extension = FilenameUtils.getExtension(filename);
        String dotExtension = extension.isEmpty() ? "" : "." + extension;
        String candidate = filename;
        for (int n = 1; !usedNames.add(candidate); n++) {
            candidate = stem + " (" + n + ")" + dotExtension;
        }
        return candidate;
    }
}
