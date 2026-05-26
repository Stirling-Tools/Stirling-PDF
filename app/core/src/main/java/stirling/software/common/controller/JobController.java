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

/** REST controller for job-related endpoints */
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

    /**
     * Process-local short-TTL cache fronting {@link JobStore#get(String)} on the sticky-410 path.
     * Without this every result download / status poll fires a Valkey HGETALL which doubles RTT on
     * the hot path when the same client re-requests the same job within seconds.
     */
    private final JobOwnershipCache ownershipCache = new JobOwnershipCache();

    @Autowired(required = false)
    private JobOwnershipService jobOwnershipService;

    @Autowired(required = false)
    private StickyMissRecorder stickyMissRecorder;

    /**
     * Get the status of a job
     *
     * @param jobId The job ID
     * @return The job result
     */
    @GetMapping("/job/{jobId}")
    @Operation(summary = "Get job status")
    public ResponseEntity<?> getJobStatus(@PathVariable("jobId") String jobId) {
        // Sticky-410 must precede user-auth (403): a non-owner node has no way to verify
        // ownership for a job it doesn't own, and a 403 here would leak job existence to
        // unauthorized callers. Return 410 first so the LB re-routes to the owner.
        Optional<ResponseEntity<?>> peerOwned = guardNonOwner(jobId);
        if (peerOwned.isPresent()) {
            return peerOwned.get();
        }

        // Validate job ownership
        if (!validateJobAccess(jobId)) {
            log.warn("Unauthorized attempt to access job status: {}", jobId);
            return ResponseEntity.status(403)
                    .body(Map.of("message", "You are not authorized to access this job"));
        }

        JobResult result = taskManager.getJobResult(jobId);
        if (result == null) {
            return ResponseEntity.notFound().build();
        }

        // Check if the job is in the queue and add queue information
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

    /**
     * Get the result of a job
     *
     * @param jobId The job ID
     * @return The job result
     */
    @GetMapping("/job/{jobId}/result")
    @Operation(summary = "Get job result")
    public ResponseEntity<?> getJobResult(@PathVariable("jobId") String jobId) {
        // Sticky-410 must precede user-auth (403): a non-owner node has no way to verify
        // ownership for a job it doesn't own, and a 403 here would leak job existence to
        // unauthorized callers. Return 410 first so the LB re-routes to the owner.
        Optional<ResponseEntity<?>> peerOwned = guardNonOwner(jobId);
        if (peerOwned.isPresent()) {
            return peerOwned.get();
        }

        // Validate job ownership
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

        // Handle multiple files - return metadata for client to download individually
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

        // Handle single file (download directly). Cross-node ownership was already resolved
        // at the top of this method, so reaching here means we ARE the owner (or single-node)
        // and the bytes live on our local disk.
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

    // Admin-only endpoints have been moved to AdminJobController in the proprietary package

    /**
     * Cancel a job by its ID
     *
     * <p>This method should only allow cancellation of jobs that were created by the current user.
     * The jobId should be part of the user's session or otherwise linked to their identity.
     *
     * @param jobId The job ID
     * @return Response indicating whether the job was cancelled
     */
    @DeleteMapping("/job/{jobId}")
    @Operation(summary = "Cancel a job")
    public ResponseEntity<?> cancelJob(@PathVariable("jobId") String jobId) {
        log.debug("Request to cancel job: {}", jobId);

        // Sticky-410 must precede user-auth (403): a non-owner node has no way to verify
        // ownership for a job it doesn't own, and a 403 here would leak job existence to
        // unauthorized callers. Return 410 first so the LB re-routes to the owner who can
        // actually cancel.
        Optional<ResponseEntity<?>> peerOwned = guardNonOwner(jobId);
        if (peerOwned.isPresent()) {
            return peerOwned.get();
        }

        // Validate job ownership
        if (!validateJobAccess(jobId)) {
            log.warn("Unauthorized attempt to cancel job: {}", jobId);
            return ResponseEntity.status(403)
                    .body(Map.of("message", "You are not authorized to cancel this job"));
        }

        // First check if the job is in the queue
        boolean cancelled = false;
        int queuePosition = -1;

        if (jobQueue.isJobQueued(jobId)) {
            queuePosition = jobQueue.getJobPosition(jobId);
            cancelled = jobQueue.cancelJob(jobId);
            log.info("Cancelled queued job: {} (was at position {})", jobId, queuePosition);
        }

        // If not in queue or couldn't cancel, try to cancel in TaskManager
        if (!cancelled) {
            JobResult result = taskManager.getJobResult(jobId);
            if (result != null && !result.isComplete()) {
                // Mark as error with cancellation message
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
            // Job not found or already complete. Cross-node ownership was already resolved at
            // the top of this method (sticky-410 precedes user-auth), so any peer-owned case
            // has been returned already; reaching here means we ARE the owner (or single-node).
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

    /**
     * Get the list of files for a job
     *
     * @param jobId The job ID
     * @return List of files for the job
     */
    @GetMapping("/job/{jobId}/result/files")
    @Operation(summary = "Get job result files")
    public ResponseEntity<?> getJobFiles(@PathVariable("jobId") String jobId) {
        // Sticky-410 must precede user-auth (403): a non-owner node has no way to verify
        // ownership for a job it doesn't own, and a 403 here would leak job existence to
        // unauthorized callers. Return 410 first so the LB re-routes to the owner.
        Optional<ResponseEntity<?>> peerOwned = guardNonOwner(jobId);
        if (peerOwned.isPresent()) {
            return peerOwned.get();
        }

        // Validate job ownership
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

    /**
     * Get metadata for an individual file by its file ID
     *
     * @param fileId The file ID
     * @return The file metadata
     */
    @GetMapping("/files/{fileId}/metadata")
    @Operation(summary = "Get file metadata")
    public ResponseEntity<?> getFileMetadata(@PathVariable("fileId") String fileId) {
        try {
            String jobKey = taskManager.findJobKeyByFileId(fileId);
            if (jobKey == null) {
                return ResponseEntity.notFound().build();
            }

            // Sticky-410 must precede user-auth (403): a non-owner node has no way to verify
            // ownership for a job it doesn't own, and a 403 here would leak file existence to
            // unauthorized callers. Return 410 first so the LB re-routes to the owner.
            Optional<ResponseEntity<?>> notOwner = guardNonOwner(jobKey);
            if (notOwner.isPresent()) {
                return notOwner.get();
            }

            if (!validateJobAccess(jobKey)) {
                log.warn("Unauthorized attempt to access file metadata: {}", fileId);
                return ResponseEntity.status(403)
                        .body(Map.of("message", "You are not authorized to access this file"));
            }

            // Find the file metadata from any job that contains this file
            ResultFile resultFile = taskManager.findResultFileByFileId(fileId);

            if (resultFile != null) {
                return ResponseEntity.ok(resultFile);
            }

            if (!isSecurityEnabled()) {
                // Backwards compatibility when ownership service is unavailable
                if (!fileStorage.fileExists(fileId)) {
                    return ResponseEntity.notFound().build();
                }

                // File exists but no metadata found, get basic info efficiently
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

    /**
     * Download an individual file by its file ID
     *
     * @param fileId The file ID
     * @return The file content
     */
    @GetMapping("/files/{fileId}")
    @Operation(summary = "Download a file")
    public ResponseEntity<?> downloadFile(@PathVariable("fileId") String fileId) {
        try {
            String jobKey = taskManager.findJobKeyByFileId(fileId);
            if (jobKey == null) {
                return ResponseEntity.notFound().build();
            }

            // Sticky-410 must precede the user-auth (403) check: a non-owner node has no way to
            // verify ownership for a job it doesn't own, and a 403 here would leak file existence
            // to unauthorized callers. Return 410 first so the LB re-routes to the owner where
            // the real auth check can run.
            Optional<ResponseEntity<?>> notOwner = guardNonOwner(jobKey);
            if (notOwner.isPresent()) {
                return notOwner.get();
            }

            if (!validateJobAccess(jobKey)) {
                log.warn("Unauthorized attempt to download file: {}", fileId);
                return ResponseEntity.status(403)
                        .body(Map.of("message", "You are not authorized to access this file"));
            }

            // Find the file metadata from any job that contains this file
            // This is for getting the original filename and content type
            ResultFile resultFile = taskManager.findResultFileByFileId(fileId);

            String fileName = resultFile != null ? resultFile.getFileName() : "download";
            String contentType =
                    resultFile != null
                            ? resultFile.getContentType()
                            : MediaType.APPLICATION_OCTET_STREAM_VALUE;

            // Retrieve file content from local disk
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
     * Returns {@code 410 Gone} with {@code {message, ownedBy, currentNode}} and {@code Retry-After:
     * 0} when the job is owned by a peer node. Returns {@link Optional#empty()} when we are the
     * owner, when cluster mode is off / JobStore has no entry, or when {@code owningNodeId} is
     * blank (caller proceeds with its normal not-found / 200 path).
     *
     * <p>Wraps the {@link JobStore#get(String)} call in a short-TTL local cache and a defensive
     * try/catch so that Valkey RTT cost is not multiplied by every download retry and so that a
     * Valkey timeout falls through to the local-disk path instead of surfacing as 500.
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
                // Valkey unavailable / timeout: treat as "no cluster-visible entry" so the request
                // can proceed to the local-disk path. Surfacing a 500 here would break every
                // download attempt during a brief Valkey blip; the worst case if we miss a real
                // peer-owned entry is one wasted round trip + a 404 from the local node.
                log.warn(
                        "JobStore lookup failed for jobId={} - treating as not-found and falling"
                                + " through to local path: {}",
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
     * Create Content-Disposition header with UTF-8 filename support
     *
     * @param fileName The filename to encode
     * @return Content-Disposition header value
     */
    private String createContentDispositionHeader(String fileName) {
        try {
            String encodedFileName =
                    RegexPatternUtils.getInstance()
                            .getPlusSignPattern()
                            .matcher(URLEncoder.encode(fileName, StandardCharsets.UTF_8))
                            .replaceAll("%20"); // URLEncoder uses + for spaces, but we want %20
            return "attachment; filename=\"" + fileName + "\"; filename*=UTF-8''" + encodedFileName;
        } catch (Exception e) {
            // Fallback to basic filename if encoding fails
            return "attachment; filename=\"" + fileName + "\"";
        }
    }

    /**
     * Validate that the current user has access to the given job.
     *
     * @param jobId the job identifier to validate
     * @return true if user has access, false otherwise
     */
    private boolean validateJobAccess(String jobId) {
        // If JobOwnershipService is available (security enabled), use it
        if (jobOwnershipService != null) {
            try {
                return jobOwnershipService.validateJobAccess(jobId);
            } catch (SecurityException e) {
                log.warn("Job ownership validation failed for jobId {}: {}", jobId, e.getMessage());
                return false;
            }
        }

        // Security disabled - allow all access (backwards compatibility)
        // When security is not enabled, any user can access any job by jobId
        return true;
    }
}
