package stirling.software.SPDF.controller.api.pipeline;

import java.io.InputStream;
import java.nio.file.Files;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

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

import stirling.software.SPDF.config.swagger.MultiFileResponse;
import stirling.software.SPDF.model.PipelineConfig;
import stirling.software.SPDF.model.PipelineOperation;
import stirling.software.SPDF.model.PipelineResult;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.PipelineApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.io.Resource;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.service.PostHogService;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.DatabindException;
import tools.jackson.databind.ObjectMapper;

// MIGRATION (Spring -> JAX-RS): @PipelineApi now supplies only the OpenAPI @Tag; the routing base
// path must be declared explicitly via @Path (see @PipelineApi javadoc: "/api/v1/pipeline").
@PipelineApi
@Path("/api/v1/pipeline")
@ApplicationScoped
@Slf4j
@RequiredArgsConstructor
public class PipelineController {

    private final PipelineProcessor processor;

    private final ObjectMapper objectMapper;

    private final PostHogService postHogService;

    private final TempFileManager tempFileManager;

    // MIGRATION (Spring -> JAX-RS): @AutoJobPostMapping is now a CDI interceptor binding and no
    // longer
    // provides routing, so the explicit @POST + @Path + @Consumes are added alongside it.
    // The former @ModelAttribute HandleDataRequest is bound here as multipart @RestForm fields: the
    // file array as List<FileUpload> and the JSON config as a String form field.
    @POST
    @Path("/handleData")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            value = "/handleData",
            consumes = MediaType.MULTIPART_FORM_DATA,
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @MultiFileResponse
    @Operation(
            summary = "Execute automated PDF processing pipeline",
            description =
                    "This endpoint processes multiple PDF files through a configurable pipeline of operations. "
                            + "Users provide files and a JSON configuration defining the sequence of operations to perform. "
                            + "Input:PDF Output:PDF/ZIP Type:MIMO")
    public Response handleData(
            @RestForm("fileInput") List<FileUpload> fileInput, @RestForm("json") String jsonString)
            throws DatabindException, JacksonException {
        if (fileInput == null) {
            return null;
        }
        // MIGRATION (Spring -> JAX-RS): adapt the inbound multipart uploads to the migration shim
        // MultipartFile so they can be passed to the existing service layer.
        // TODO: Migration required - PipelineProcessor.generateInputFiles still declares the Spring
        // org.springframework.web.multipart.MultipartFile[] parameter type. When that collaborator
        // is
        // migrated to stirling.software.common.model.MultipartFile[], this array type lines up.
        // Until
        // then this controller will not compile against the processor; the adapter call below
        // targets
        // the migrated shim type.
        stirling.software.common.model.MultipartFile[] files =
                new stirling.software.common.model.MultipartFile[fileInput.size()];
        for (int i = 0; i < fileInput.size(); i++) {
            files[i] = FileUploadMultipartFile.of(fileInput.get(i));
        }
        PipelineConfig config = objectMapper.readValue(jsonString, PipelineConfig.class);
        log.info("Received POST request to /handleData with {} files", files.length);

        List<String> operationNames =
                config.getOperations().stream().map(PipelineOperation::getOperation).toList();

        Map<String, Object> properties = new HashMap<>();
        properties.put("operations", operationNames);
        properties.put("fileCount", files.length);

        postHogService.captureEvent("pipeline_api_event", properties);

        try {
            List<Resource> inputFiles = processor.generateInputFiles(files);
            if (inputFiles == null || inputFiles.isEmpty()) {
                return null;
            }
            PipelineResult result = processor.runPipelineAgainstFiles(inputFiles, config);
            List<Resource> outputFiles = result.getOutputFiles();
            if (outputFiles != null && outputFiles.size() == 1) {
                // If there is only one file, return it directly — stream without int-overflow
                Resource singleFile = outputFiles.get(0);
                TempFile singleTempFile = new TempFile(tempFileManager, ".out");
                try {
                    try (InputStream is = singleFile.getInputStream()) {
                        is.transferTo(Files.newOutputStream(singleTempFile.getPath()));
                    }
                    log.info("Returning single file response...");
                    return WebResponseUtils.fileToWebResponse(
                            singleTempFile,
                            singleFile.getFilename(),
                            MediaType.valueOf(MediaType.APPLICATION_OCTET_STREAM));
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
                Map<String, Integer> filenameCount = new HashMap<>();
                try (ZipOutputStream zipOut =
                        new ZipOutputStream(Files.newOutputStream(zipTempFile.getPath()))) {
                    for (Resource file : outputFiles) {
                        String originalFilename = file.getFilename();
                        String filename = originalFilename;
                        if (filenameCount.containsKey(originalFilename)) {
                            int count = filenameCount.get(originalFilename);
                            filename =
                                    GeneralUtils.generateFilename(
                                            originalFilename, "(" + count + ")");
                            filenameCount.put(originalFilename, count + 1);
                        } else {
                            filenameCount.put(originalFilename, 1);
                        }
                        zipOut.putNextEntry(new ZipEntry(filename));
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
        } catch (Exception e) {
            log.error("Error handling data: ", e);
            return null;
        }
    }
}
