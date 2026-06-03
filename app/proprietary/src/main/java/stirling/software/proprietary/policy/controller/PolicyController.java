package stirling.software.proprietary.policy.controller;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.job.JobResponse;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.proprietary.policy.engine.PolicyRunRegistry;
import stirling.software.proprietary.policy.model.PipelineDefinition;
import stirling.software.proprietary.policy.model.PolicyRun;
import stirling.software.proprietary.policy.model.PolicyRunView;
import stirling.software.proprietary.policy.progress.PolicyProgressListener;
import stirling.software.proprietary.policy.trigger.ManualTrigger;
import stirling.software.proprietary.security.config.PremiumEndpoint;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

/**
 * Manually triggers and inspects pipeline runs. The premium backend entry point for running a
 * pipeline of tools; the Automate frontend targets this once it moves server-side.
 *
 * <p>Runs execute asynchronously: {@code POST /run} returns a run id immediately. Poll {@code GET
 * /run/{runId}} for status, and download outputs via the existing {@code GET
 * /api/v1/general/files/{fileId}} using the file ids in the run view.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/policies")
@Hidden
@PremiumEndpoint
@RequiredArgsConstructor
@Tag(name = "Policies", description = "Run tool pipelines on the backend")
public class PolicyController {

    private final ManualTrigger manualTrigger;
    private final PolicyRunRegistry runRegistry;
    private final ObjectMapper objectMapper;
    private final TempFileManager tempFileManager;

    @PostMapping(value = "/run", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Run a tool pipeline",
            description =
                    "Accepts input files and a JSON pipeline definition, runs the steps in order"
                            + " asynchronously, and returns a run id. Poll the run status endpoint"
                            + " and download outputs via /api/v1/general/files/{fileId}.")
    public ResponseEntity<JobResponse<Void>> run(
            @RequestParam(value = "fileInput", required = false) MultipartFile[] files,
            @RequestParam("json") String json)
            throws IOException {
        PipelineDefinition definition = parseDefinition(json);
        if (definition.steps().isEmpty()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Pipeline definition has no steps");
        }
        List<Resource> inputs = toResources(files);
        String runId = manualTrigger.fire(definition, inputs, PolicyProgressListener.NOOP);
        return ResponseEntity.accepted().body(new JobResponse<>(true, runId, null));
    }

    @GetMapping("/run/{runId}")
    @Operation(
            summary = "Get pipeline run status",
            description = "Returns the current status, step cursor, and output files of a run.")
    public ResponseEntity<PolicyRunView> status(@PathVariable String runId) {
        PolicyRun run = runRegistry.get(runId);
        if (run == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(PolicyRunView.of(run));
    }

    private PipelineDefinition parseDefinition(String json) {
        try {
            return objectMapper.readValue(json, PipelineDefinition.class);
        } catch (JacksonException e) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Invalid pipeline definition JSON");
        }
    }

    private List<Resource> toResources(MultipartFile[] files) throws IOException {
        List<Resource> resources = new ArrayList<>();
        if (files == null) {
            return resources;
        }
        for (MultipartFile file : files) {
            if (file == null || file.isEmpty()) {
                continue;
            }
            TempFile tempFile = tempFileManager.createManagedTempFile("policy-run");
            file.transferTo(tempFile.getPath());
            final String originalName = Filenames.toSimpleFileName(file.getOriginalFilename());
            resources.add(
                    new FileSystemResource(tempFile.getFile()) {
                        @Override
                        public String getFilename() {
                            return originalName;
                        }
                    });
        }
        return resources;
    }
}
