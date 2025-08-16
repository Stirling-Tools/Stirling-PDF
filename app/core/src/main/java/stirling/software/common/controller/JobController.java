package stirling.software.common.controller;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

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

import stirling.software.common.model.job.JobResult;
import stirling.software.common.model.job.ResultFile;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.JobQueue;
import stirling.software.common.service.TaskManager;

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

    /**
     * Get the status of a job
     *
     * @param jobId The job ID
     * @return The job result
     */
    @GetMapping("/job/{jobId}")
    @Operation(summary = "Get job status")
    public ResponseEntity<?> getJobStatus(@PathVariable("jobId") String jobId) {
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

        // Handle single file (download directly)
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

        // Verify that this job belongs to the current user
        // We can use the current request's session to validate ownership
        Object sessionJobIds = request.getSession().getAttribute("userJobIds");
        if (sessionJobIds == null
                || !(sessionJobIds instanceof java.util.Set)
                || !((java.util.Set<?>) sessionJobIds).contains(jobId)) {
            // Either no jobs in session or jobId doesn't match user's jobs
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
            // Job not found or already complete
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
            // Verify file exists
            if (!fileStorage.fileExists(fileId)) {
                return ResponseEntity.notFound().build();
            }

            // Find the file metadata from any job that contains this file
            ResultFile resultFile = taskManager.findResultFileByFileId(fileId);

            if (resultFile != null) {
                return ResponseEntity.ok(resultFile);
            } else {
                // File exists but no metadata found, get basic info efficiently
                long fileSize = fileStorage.getFileSize(fileId);
                return ResponseEntity.ok(
                        Map.of(
                                "fileId",
                                fileId,
                                "fileName",
                                "unknown",
                                "contentType",
                                "application/octet-stream",
                                "fileSize",
                                fileSize));
            }
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
            // Verify file exists
            if (!fileStorage.fileExists(fileId)) {
                return ResponseEntity.notFound().build();
            }

            // Retrieve file content
            byte[] fileContent = fileStorage.retrieveBytes(fileId);

            // Find the file metadata from any job that contains this file
            // This is for getting the original filename and content type
            ResultFile resultFile = taskManager.findResultFileByFileId(fileId);

            String fileName = resultFile != null ? resultFile.getFileName() : "download";
            String contentType =
                    resultFile != null ? resultFile.getContentType() : "application/octet-stream";

            return ResponseEntity.ok()
                    .header("Content-Type", contentType)
                    .header("Content-Disposition", createContentDispositionHeader(fileName))
                    .body(fileContent);
        } catch (Exception e) {
            log.error("Error retrieving file {}: {}", fileId, e.getMessage(), e);
            return ResponseEntity.internalServerError()
                    .body("Error retrieving file: " + e.getMessage());
        }
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
                    URLEncoder.encode(fileName, StandardCharsets.UTF_8)
                            .replace("+", "%20"); // URLEncoder uses + for spaces, but we want %20
            return "attachment; filename=\"" + fileName + "\"; filename*=UTF-8''" + encodedFileName;
        } catch (Exception e) {
            // Fallback to basic filename if encoding fails
            return "attachment; filename=\"" + fileName + "\"";
        }
    }
}
