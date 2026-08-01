package stirling.software.common.controller;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.servlet.http.HttpServletRequest;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.ClusterBackplane;
import stirling.software.common.cluster.JobStore;
import stirling.software.common.cluster.JobStoreEntry;
import stirling.software.common.cluster.StickyMissRecorder;
import stirling.software.common.model.job.JobResult;
import stirling.software.common.model.job.ResultFile;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.JobOwnershipService;
import stirling.software.common.service.JobQueue;
import stirling.software.common.service.TaskManager;
import stirling.software.common.util.RegexPatternUtils;

@RestController
@RequiredArgsConstructor
@Slf4j
@RequestMapping("/api/v1/general")
@Tag(name = "Job Management", description = "Job Management API")
public class JobController {

    private final TaskManager taskManager;
    private final FileStorage fileStorage;
    private final JobQueue jobQueue;
    private final HttpServletRequest request;
    private final ClusterBackplane clusterBackplane;
    private final JobStore jobStore;

    // Short-TTL local cache fronting JobStore.get() on the sticky-410 path to avoid a Valkey
    // HGETALL round-trip on every download retry for the same job.
    private final JobOwnershipCache ownershipCache = new JobOwnershipCache();

    @Autowired(required = false)
    private JobOwnershipService jobOwnershipService;

    @Autowired(required = false)
    private StickyMissRecorder stickyMissRecorder;

    @GetMapping("/job/{jobId}")
    @Operation(summary = "Get job status")
    public ResponseEntity<?> getJobStatus(@PathVariable("jobId") String jobId) {
        // Sticky-410 must run before user-auth: a 403 here would leak job existence and defeat
        // LB re-routing. The owner node is where the real auth check should happen.
        Optional<ResponseEntity<?>> peerOwned = guardNonOwner(jobId);
        if (peerOwned.isPresent()) {
            return peerOwned.get();
        }

        if (!validateJobAccess(jobId)) {
            log.warn("Unauthorized attempt to access job status: {}", jobId);
            return ResponseEntity.status(403)
                    .body(Map.of("message", "You are not authorized to access this job"));
        }

        JobResult result = taskManager.getJobResult(jobId);
        if (result == null) {
            return ResponseEntity.notFound().build();
        }

        if (!result.isComplete() && jobQueue.isJobQueued(jobId)) {
            int position = jobQueue.getJobPosition(jobId);
            Map<String, Object> resultWithQueueInfo =
                    Map.of(
                            "jobResult",
                            result,
                            "queueInfo",
                            Map.of("inQueue", true, "position", position));
            return ResponseEntity.ok(resultWithQueueInfo);
        }

        return ResponseEntity.ok(result);
    }

    @GetMapping("/job/{jobId}/result")
    @Operation(summary = "Get job result")
    public ResponseEntity<?> getJobResult(@PathVariable("jobId") String jobId) {
        Optional<ResponseEntity<?>> peerOwned = guardNonOwner(jobId);
        if (peerOwned.isPresent()) {
            return peerOwned.get();
        }

        if (!validateJobAccess(jobId)) {
            log.warn("Unauthorized attempt to access job result: {}", jobId);
            return ResponseEntity.status(403)
                    .body(Map.of("message", "You are not authorized to access this job"));
        }

        JobResult result = taskManager.getJobResult(jobId);
        if (result == null) {
            return ResponseEntity.notFound().build();
        }

        if (!result.isComplete()) {
            return ResponseEntity.badRequest().body("Job is not complete yet");
        }

        if (result.getError() != null) {
            return ResponseEntity.badRequest().body("Job failed: " + result.getError());
        }

        if (result.hasMultipleFiles()) {
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(
                            Map.of(
                                    "jobId",
                                    jobId,
                                    "hasMultipleFiles",
                                    true,
                                    "files",
                                    result.getAllResultFiles()));
        }

        if (result.hasFiles() && !result.hasMultipleFiles()) {
            try {
                List<ResultFile> files = result.getAllResultFiles();
                ResultFile singleFile = files.get(0);

                byte[] fileContent = fileStorage.retrieveBytes(singleFile.getFileId());
                return ResponseEntity.ok()
                        .header("Content-Type", singleFile.getContentType())
                        .header(
                                "Content-Disposition",
                                createContentDispositionHeader(singleFile.getFileName()))
                        .body(fileContent);
            } catch (Exception e) {
                log.error("Error retrieving file for job {}: {}", jobId, e.getMessage(), e);
                return ResponseEntity.internalServerError()
                        .body("Error retrieving file: " + e.getMessage());
            }
        }

        return ResponseEntity.ok(result.getResult());
    }

    @DeleteMapping("/job/{jobId}")
    @Operation(summary = "Cancel a job")
    public ResponseEntity<?> cancelJob(@PathVariable("jobId") String jobId) {
        log.debug("Request to cancel job: {}", jobId);

        Optional<ResponseEntity<?>> peerOwned = guardNonOwner(jobId);
        if (peerOwned.isPresent()) {
            return peerOwned.get();
        }

        if (!validateJobAccess(jobId)) {
            log.warn("Unauthorized attempt to cancel job: {}", jobId);
            return ResponseEntity.status(403)
                    .body(Map.of("message", "You are not authorized to cancel this job"));
        }

        boolean cancelled = false;
        int queuePosition = -1;

        if (jobQueue.isJobQueued(jobId)) {
            queuePosition = jobQueue.getJobPosition(jobId);
            cancelled = jobQueue.cancelJob(jobId);
            log.info("Cancelled queued job: {} (was at position {})", jobId, queuePosition);
        }

        if (!cancelled) {
            JobResult result = taskManager.getJobResult(jobId);
            if (result != null && !result.isComplete()) {
                taskManager.setError(jobId, "Job was cancelled by user");
                cancelled = true;
                log.info("Marked job as cancelled in TaskManager: {}", jobId);
            }
        }

        if (cancelled) {
            return ResponseEntity.ok(
                    Map.of(
                            "message",
                            "Job cancelled successfully",
                            "wasQueued",
                            queuePosition >= 0,
                            "queuePosition",
                            queuePosition >= 0 ? queuePosition : "n/a"));
        } else {
            JobResult result = taskManager.getJobResult(jobId);
            if (result == null) {
                return ResponseEntity.notFound().build();
            } else if (result.isComplete()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("message", "Cannot cancel job that is already complete"));
            } else {
                return ResponseEntity.internalServerError()
                        .body(Map.of("message", "Failed to cancel job for unknown reason"));
            }
        }
    }

    @GetMapping("/job/{jobId}/result/files")
    @Operation(summary = "Get job result files")
    public ResponseEntity<?> getJobFiles(@PathVariable("jobId") String jobId) {
        Optional<ResponseEntity<?>> peerOwned = guardNonOwner(jobId);
        if (peerOwned.isPresent()) {
            return peerOwned.get();
        }

        if (!validateJobAccess(jobId)) {
            log.warn("Unauthorized attempt to access job files: {}", jobId);
            return ResponseEntity.status(403)
                    .body(Map.of("message", "You are not authorized to access this job"));
        }

        JobResult result = taskManager.getJobResult(jobId);
        if (result == null) {
            return ResponseEntity.notFound().build();
        }

        if (!result.isComplete()) {
            return ResponseEntity.badRequest().body("Job is not complete yet");
        }

        if (result.getError() != null) {
            return ResponseEntity.badRequest().body("Job failed: " + result.getError());
        }

        List<ResultFile> files = result.getAllResultFiles();
        return ResponseEntity.ok(
                Map.of(
                        "jobId", jobId,
                        "fileCount", files.size(),
                        "files", files));
    }

    @GetMapping("/files/{fileId}/metadata")
    @Operation(summary = "Get file metadata")
    public ResponseEntity<?> getFileMetadata(@PathVariable("fileId") String fileId) {
        try {
            String jobKey;
            try {
                jobKey = taskManager.findJobKeyByFileId(fileId);
            } catch (RuntimeException backplaneEx) {
                return backplaneUnavailable(fileId, backplaneEx);
            }
            if (jobKey == null) {
                return ResponseEntity.notFound().build();
            }

            Optional<ResponseEntity<?>> notOwner = guardNonOwner(jobKey);
            if (notOwner.isPresent()) {
                return notOwner.get();
            }

            if (!validateJobAccess(jobKey)) {
                log.warn("Unauthorized attempt to access file metadata: {}", fileId);
                return ResponseEntity.status(403)
                        .body(Map.of("message", "You are not authorized to access this file"));
            }

            ResultFile resultFile = taskManager.findResultFileByFileId(fileId);

            if (resultFile != null) {
                return ResponseEntity.ok(resultFile);
            }

            if (!isSecurityEnabled()) {
                if (!fileStorage.fileExists(fileId)) {
                    return ResponseEntity.notFound().build();
                }

                long fileSize = fileStorage.getFileSize(fileId);
                return ResponseEntity.ok(
                        Map.of(
                                "fileId",
                                fileId,
                                "fileName",
                                "unknown",
                                "contentType",
                                MediaType.APPLICATION_OCTET_STREAM_VALUE,
                                "fileSize",
                                fileSize));
            }

            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            log.error("Error retrieving file metadata {}: {}", fileId, e.getMessage(), e);
            return ResponseEntity.internalServerError()
                    .body("Error retrieving file metadata: " + e.getMessage());
        }
    }

    @GetMapping("/files/{fileId}")
    @Operation(summary = "Download a file")
    public ResponseEntity<?> downloadFile(@PathVariable("fileId") String fileId) {
        try {
            String jobKey;
            try {
                jobKey = taskManager.findJobKeyByFileId(fileId);
            } catch (RuntimeException backplaneEx) {
                return backplaneUnavailable(fileId, backplaneEx);
            }
            if (jobKey == null) {
                return ResponseEntity.notFound().build();
            }

            Optional<ResponseEntity<?>> notOwner = guardNonOwner(jobKey);
            if (notOwner.isPresent()) {
                return notOwner.get();
            }

            if (!validateJobAccess(jobKey)) {
                log.warn("Unauthorized attempt to download file: {}", fileId);
                return ResponseEntity.status(403)
                        .body(Map.of("message", "You are not authorized to access this file"));
            }

            ResultFile resultFile = taskManager.findResultFileByFileId(fileId);

            String fileName = resultFile != null ? resultFile.getFileName() : "download";
            String contentType =
                    resultFile != null
                            ? resultFile.getContentType()
                            : MediaType.APPLICATION_OCTET_STREAM_VALUE;

            byte[] fileContent = fileStorage.retrieveBytes(fileId);

            return ResponseEntity.ok()
                    .header("Content-Type", contentType)
                    .header("Content-Disposition", createContentDispositionHeader(fileName))
                    .body(fileContent);
        } catch (Exception e) {
            log.error("Error retrieving file {}: {}", fileId, e.getMessage(), e);
            return ResponseEntity.internalServerError().body("Error retrieving file");
        }
    }

    private boolean isSecurityEnabled() {
        return jobOwnershipService != null;
    }

    /**
     * Returns 410 Gone when the job is owned by a peer node, empty otherwise. Uses a short-TTL
     * local cache to avoid repeated Valkey lookups on the hot download path. When the backplane is
     * unreachable, a locally-held job is still served and anything else gets a retryable 503.
     */
    private Optional<ResponseEntity<?>> guardNonOwner(String jobId) {
        if (clusterBackplane == null || jobStore == null) {
            return Optional.empty();
        }
        Optional<JobStoreEntry> entry;
        Optional<Optional<JobStoreEntry>> cached = ownershipCache.get(jobId);
        if (cached.isPresent()) {
            entry = cached.get();
        } else {
            try {
                entry = jobStore.get(jobId);
            } catch (RuntimeException ex) {
                // Backplane unreachable: if we hold the job locally serve it, otherwise return a
                // retryable 503 (same contract as the file endpoints) instead of a misleading 404.
                if (taskManager.getJobResult(jobId) == null) {
                    return Optional.of(backplaneUnavailable(jobId, ex));
                }
                log.warn(
                        "JobStore lookup failed for jobId={}; serving locally-held job: {}",
                        jobId,
                        ex.getMessage());
                return Optional.empty();
            }
            ownershipCache.put(jobId, entry);
        }
        if (entry.isEmpty()) {
            return Optional.empty();
        }
        String owner = entry.get().owningNodeId();
        if (owner == null || owner.isBlank()) {
            return Optional.empty();
        }
        String localId = clusterBackplane.localNodeId();
        if (owner.equals(localId)) {
            return Optional.empty();
        }
        log.info(
                "Sticky-session miss for jobId={} (owner={}, local={}); returning 410 so client"
                        + " retries via LB affinity",
                jobId,
                owner,
                localId);
        if (stickyMissRecorder != null) {
            stickyMissRecorder.recordStickyMiss();
        }
        return Optional.of(
                ResponseEntity.status(410)
                        .header("Retry-After", "0")
                        .body(
                                Map.of(
                                        "message",
                                        "Result lives on another node. Retry to be routed there"
                                                + " by the load balancer's sticky-session"
                                                + " affinity, or re-run the job.",
                                        "ownedBy",
                                        owner,
                                        "currentNode",
                                        localId == null ? "" : localId)));
    }

    /**
     * When the backplane is unreachable we cannot resolve ownership or existence, and serving
     * without that check would be unsafe - so return a retryable 503 (consistent with the
     * sticky-410 retry model) rather than a misleading 404 or a generic 500.
     */
    private ResponseEntity<?> backplaneUnavailable(String id, RuntimeException ex) {
        log.warn(
                "Backplane lookup failed for {}; returning 503 (retryable): {}",
                id,
                ex.getMessage());
        return ResponseEntity.status(503)
                .header("Retry-After", "1")
                .body(
                        Map.of(
                                "message",
                                "Cluster backplane temporarily unavailable; retry shortly."));
    }

    private String createContentDispositionHeader(String fileName) {
        try {
            String encodedFileName =
                    RegexPatternUtils.getInstance()
                            .getPlusSignPattern()
                            .matcher(URLEncoder.encode(fileName, StandardCharsets.UTF_8))
                            .replaceAll("%20"); // URLEncoder uses + for spaces, but we want %20
            return "attachment; filename=\"" + fileName + "\"; filename*=UTF-8''" + encodedFileName;
        } catch (Exception e) {
            return "attachment; filename=\"" + fileName + "\"";
        }
    }

    private boolean validateJobAccess(String jobId) {
        if (jobOwnershipService != null) {
            try {
                return jobOwnershipService.validateJobAccess(jobId);
            } catch (SecurityException e) {
                log.warn("Job ownership validation failed for jobId {}: {}", jobId, e.getMessage());
                return false;
            }
        }

        return true;
    }
}
