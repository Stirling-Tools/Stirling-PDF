package stirling.software.common.service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.ZipSecurity;

import jakarta.annotation.PreDestroy;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.job.JobResult;
import stirling.software.common.model.job.JobStats;
import stirling.software.common.model.job.ResultFile;

/** Manages async tasks and their results */
@Service
@Slf4j
public class TaskManager {
    private final Map<String, JobResult> jobResults = new ConcurrentHashMap<>();

    @Value("${stirling.jobResultExpiryMinutes:30}")
    private int jobResultExpiryMinutes = 30;

    private final FileStorage fileStorage;
    private final ScheduledExecutorService cleanupExecutor =
            Executors.newSingleThreadScheduledExecutor();

    /** Initialize the task manager and start the cleanup scheduler */
    public TaskManager(FileStorage fileStorage) {
        this.fileStorage = fileStorage;

        // Schedule periodic cleanup of old job results
        cleanupExecutor.scheduleAtFixedRate(
                this::cleanupOldJobs,
                10, // Initial delay
                10, // Interval
                TimeUnit.MINUTES);

        log.debug(
                "Task manager initialized with job result expiry of {} minutes",
                jobResultExpiryMinutes);
    }

    /**
     * Create a new task with the given job ID
     *
     * @param jobId The job ID
     */
    public void createTask(String jobId) {
        jobResults.put(jobId, JobResult.createNew(jobId));
        log.debug("Created task with job ID: {}", jobId);
    }

    /**
     * Set the result of a task as a general object
     *
     * @param jobId The job ID
     * @param result The result object
     */
    public void setResult(String jobId, Object result) {
        JobResult jobResult = getOrCreateJobResult(jobId);
        jobResult.completeWithResult(result);
        log.debug("Set result for job ID: {}", jobId);
    }

    /**
     * Set the result of a task as a file
     *
     * @param jobId The job ID
     * @param fileId The file ID
     * @param originalFileName The original file name
     * @param contentType The content type of the file
     */
    public void setFileResult(
            String jobId, String fileId, String originalFileName, String contentType) {
        JobResult jobResult = getOrCreateJobResult(jobId);

        // Check if this is a ZIP file that should be extracted
        if (isZipFile(contentType, originalFileName)) {
            try {
                List<ResultFile> extractedFiles =
                        extractZipToIndividualFiles(fileId, originalFileName);
                if (!extractedFiles.isEmpty()) {
                    jobResult.completeWithFiles(extractedFiles);
                    log.debug(
                            "Set multiple file results for job ID: {} with {} files extracted from ZIP",
                            jobId,
                            extractedFiles.size());
                    return;
                }
            } catch (Exception e) {
                log.warn(
                        "Failed to extract ZIP file for job {}: {}. Falling back to single file result.",
                        jobId,
                        e.getMessage());
            }
        }

        // Handle as single file using new ResultFile approach
        try {
            long fileSize = fileStorage.getFileSize(fileId);
            jobResult.completeWithSingleFile(fileId, originalFileName, contentType, fileSize);
            log.debug("Set single file result for job ID: {} with file ID: {}", jobId, fileId);
        } catch (Exception e) {
            log.warn(
                    "Failed to get file size for job {}: {}. Using size 0.", jobId, e.getMessage());
            jobResult.completeWithSingleFile(fileId, originalFileName, contentType, 0);
        }
    }

    /**
     * Set the result of a task as multiple files
     *
     * @param jobId The job ID
     * @param resultFiles The list of result files
     */
    public void setMultipleFileResults(String jobId, List<ResultFile> resultFiles) {
        JobResult jobResult = getOrCreateJobResult(jobId);
        jobResult.completeWithFiles(resultFiles);
        log.debug(
                "Set multiple file results for job ID: {} with {} files",
                jobId,
                resultFiles.size());
    }

    /**
     * Set an error for a task
     *
     * @param jobId The job ID
     * @param error The error message
     */
    public void setError(String jobId, String error) {
        JobResult jobResult = getOrCreateJobResult(jobId);
        jobResult.failWithError(error);
        log.debug("Set error for job ID: {}: {}", jobId, error);
    }

    /**
     * Mark a task as complete
     *
     * @param jobId The job ID
     */
    public void setComplete(String jobId) {
        JobResult jobResult = getOrCreateJobResult(jobId);
        if (jobResult.getResult() == null
                && !jobResult.hasFiles()
                && jobResult.getError() == null) {
            // If no result or error has been set, mark it as complete with an empty result
            jobResult.completeWithResult("Task completed successfully");
        }
        log.debug("Marked job ID: {} as complete", jobId);
    }

    /**
     * Check if a task is complete
     *
     * @param jobId The job ID
     * @return true if the task is complete, false otherwise
     */
    public boolean isComplete(String jobId) {
        JobResult result = jobResults.get(jobId);
        return result != null && result.isComplete();
    }

    /**
     * Get the result of a task
     *
     * @param jobId The job ID
     * @return The result object, or null if the task doesn't exist or is not complete
     */
    public JobResult getJobResult(String jobId) {
        return jobResults.get(jobId);
    }

    /**
     * Add a note to a task. Notes are informational messages that can be attached to a job for
     * tracking purposes.
     *
     * @param jobId The job ID
     * @param note The note to add
     * @return true if the note was added successfully, false if the job doesn't exist
     */
    public boolean addNote(String jobId, String note) {
        JobResult jobResult = jobResults.get(jobId);
        if (jobResult != null) {
            jobResult.addNote(note);
            log.debug("Added note to job ID: {}: {}", jobId, note);
            return true;
        }
        log.warn("Attempted to add note to non-existent job ID: {}", jobId);
        return false;
    }

    /**
     * Get statistics about all jobs in the system
     *
     * @return Job statistics
     */
    public JobStats getJobStats() {
        int totalJobs = jobResults.size();
        int activeJobs = 0;
        int completedJobs = 0;
        int failedJobs = 0;
        int successfulJobs = 0;
        int fileResultJobs = 0;

        LocalDateTime oldestActiveJobTime = null;
        LocalDateTime newestActiveJobTime = null;
        long totalProcessingTimeMs = 0;

        for (JobResult result : jobResults.values()) {
            if (result.isComplete()) {
                completedJobs++;

                // Calculate processing time for completed jobs
                if (result.getCreatedAt() != null && result.getCompletedAt() != null) {
                    long processingTimeMs =
                            java.time.Duration.between(
                                            result.getCreatedAt(), result.getCompletedAt())
                                    .toMillis();
                    totalProcessingTimeMs += processingTimeMs;
                }

                if (result.getError() != null) {
                    failedJobs++;
                } else {
                    successfulJobs++;
                    if (result.hasFiles()) {
                        fileResultJobs++;
                    }
                }
            } else {
                activeJobs++;

                // Track oldest and newest active jobs
                if (result.getCreatedAt() != null) {
                    if (oldestActiveJobTime == null
                            || result.getCreatedAt().isBefore(oldestActiveJobTime)) {
                        oldestActiveJobTime = result.getCreatedAt();
                    }

                    if (newestActiveJobTime == null
                            || result.getCreatedAt().isAfter(newestActiveJobTime)) {
                        newestActiveJobTime = result.getCreatedAt();
                    }
                }
            }
        }

        // Calculate average processing time
        long averageProcessingTimeMs =
                completedJobs > 0 ? totalProcessingTimeMs / completedJobs : 0;

        return JobStats.builder()
                .totalJobs(totalJobs)
                .activeJobs(activeJobs)
                .completedJobs(completedJobs)
                .failedJobs(failedJobs)
                .successfulJobs(successfulJobs)
                .fileResultJobs(fileResultJobs)
                .oldestActiveJobTime(oldestActiveJobTime)
                .newestActiveJobTime(newestActiveJobTime)
                .averageProcessingTimeMs(averageProcessingTimeMs)
                .build();
    }

    /**
     * Get or create a job result
     *
     * @param jobId The job ID
     * @return The job result
     */
    private JobResult getOrCreateJobResult(String jobId) {
        return jobResults.computeIfAbsent(jobId, JobResult::createNew);
    }

    /** Clean up old completed job results */
    public void cleanupOldJobs() {
        LocalDateTime expiryThreshold =
                LocalDateTime.now().minus(jobResultExpiryMinutes, ChronoUnit.MINUTES);
        int removedCount = 0;

        try {
            for (Map.Entry<String, JobResult> entry : jobResults.entrySet()) {
                JobResult result = entry.getValue();

                // Remove completed jobs that are older than the expiry threshold
                if (result.isComplete()
                        && result.getCompletedAt() != null
                        && result.getCompletedAt().isBefore(expiryThreshold)) {

                    // Clean up file results
                    cleanupJobFiles(result, entry.getKey());

                    // Remove the job result
                    jobResults.remove(entry.getKey());
                    removedCount++;
                }
            }

            if (removedCount > 0) {
                log.info("Cleaned up {} expired job results", removedCount);
            }
        } catch (Exception e) {
            log.error("Error during job cleanup: {}", e.getMessage(), e);
        }
    }

    /** Shutdown the cleanup executor */
    @PreDestroy
    public void shutdown() {
        try {
            log.info("Shutting down job result cleanup executor");
            cleanupExecutor.shutdown();
            if (!cleanupExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                cleanupExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            cleanupExecutor.shutdownNow();
        }
    }

    /** Check if a file is a ZIP file based on content type and filename */
    private boolean isZipFile(String contentType, String fileName) {
        if (contentType != null
                && (contentType.equals("application/zip")
                        || contentType.equals("application/x-zip-compressed"))) {
            return true;
        }

        if (fileName != null && fileName.toLowerCase().endsWith(".zip")) {
            return true;
        }

        return false;
    }

    /** Extract a ZIP file into individual files and store them */
    private List<ResultFile> extractZipToIndividualFiles(
            String zipFileId, String originalZipFileName) throws IOException {
        List<ResultFile> extractedFiles = new ArrayList<>();

        MultipartFile zipFile = fileStorage.retrieveFile(zipFileId);

        try (ZipInputStream zipIn =
                ZipSecurity.createHardenedInputStream(
                        new ByteArrayInputStream(zipFile.getBytes()))) {
            ZipEntry entry;
            while ((entry = zipIn.getNextEntry()) != null) {
                if (!entry.isDirectory()) {
                    // Use buffered reading for memory safety
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buffer = new byte[4096];
                    int bytesRead;
                    while ((bytesRead = zipIn.read(buffer)) != -1) {
                        out.write(buffer, 0, bytesRead);
                    }
                    byte[] fileContent = out.toByteArray();

                    String contentType = determineContentType(entry.getName());
                    String individualFileId = fileStorage.storeBytes(fileContent, entry.getName());

                    ResultFile resultFile =
                            ResultFile.builder()
                                    .fileId(individualFileId)
                                    .fileName(entry.getName())
                                    .contentType(contentType)
                                    .fileSize(fileContent.length)
                                    .build();

                    extractedFiles.add(resultFile);
                    log.debug(
                            "Extracted file: {} (size: {} bytes)",
                            entry.getName(),
                            fileContent.length);
                }
                zipIn.closeEntry();
            }
        }

        // Clean up the original ZIP file after extraction
        try {
            fileStorage.deleteFile(zipFileId);
            log.debug("Cleaned up original ZIP file: {}", zipFileId);
        } catch (Exception e) {
            log.warn("Failed to clean up original ZIP file {}: {}", zipFileId, e.getMessage());
        }

        return extractedFiles;
    }

    /** Determine content type based on file extension */
    private String determineContentType(String fileName) {
        if (fileName == null) {
            return MediaType.APPLICATION_OCTET_STREAM_VALUE;
        }

        String lowerName = fileName.toLowerCase();
        if (lowerName.endsWith(".pdf")) {
            return MediaType.APPLICATION_PDF_VALUE;
        } else if (lowerName.endsWith(".txt")) {
            return MediaType.TEXT_PLAIN_VALUE;
        } else if (lowerName.endsWith(".json")) {
            return MediaType.APPLICATION_JSON_VALUE;
        } else if (lowerName.endsWith(".xml")) {
            return MediaType.APPLICATION_XML_VALUE;
        } else if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
            return MediaType.IMAGE_JPEG_VALUE;
        } else if (lowerName.endsWith(".png")) {
            return MediaType.IMAGE_PNG_VALUE;
        } else {
            return MediaType.APPLICATION_OCTET_STREAM_VALUE;
        }
    }

    /** Clean up files associated with a job result */
    private void cleanupJobFiles(JobResult result, String jobId) {
        // Clean up all result files
        if (result.hasFiles()) {
            for (ResultFile resultFile : result.getAllResultFiles()) {
                try {
                    fileStorage.deleteFile(resultFile.getFileId());
                } catch (Exception e) {
                    log.warn(
                            "Failed to delete file {} for job {}: {}",
                            resultFile.getFileId(),
                            jobId,
                            e.getMessage());
                }
            }
        }
    }

    /** Find the ResultFile metadata for a given file ID by searching through all job results */
    public ResultFile findResultFileByFileId(String fileId) {
        for (JobResult jobResult : jobResults.values()) {
            if (jobResult.hasFiles()) {
                for (ResultFile resultFile : jobResult.getAllResultFiles()) {
                    if (fileId.equals(resultFile.getFileId())) {
                        return resultFile;
                    }
                }
            }
        }
        return null;
    }
}
