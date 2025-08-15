package stirling.software.common.service;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import jakarta.servlet.http.HttpServletRequest;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.job.JobResponse;
import stirling.software.common.util.ExecutorFactory;

/** Service for executing jobs asynchronously or synchronously */
@Service
@Slf4j
public class JobExecutorService {

    private final TaskManager taskManager;
    private final FileStorage fileStorage;
    private final HttpServletRequest request;
    private final ResourceMonitor resourceMonitor;
    private final JobQueue jobQueue;
    private final ExecutorService executor = ExecutorFactory.newVirtualOrCachedThreadExecutor();
    private final long effectiveTimeoutMs;

    public JobExecutorService(
            TaskManager taskManager,
            FileStorage fileStorage,
            HttpServletRequest request,
            ResourceMonitor resourceMonitor,
            JobQueue jobQueue,
            @Value("${spring.mvc.async.request-timeout:1200000}") long asyncRequestTimeoutMs,
            @Value("${server.servlet.session.timeout:30m}") String sessionTimeout) {
        this.taskManager = taskManager;
        this.fileStorage = fileStorage;
        this.request = request;
        this.resourceMonitor = resourceMonitor;
        this.jobQueue = jobQueue;

        // Parse session timeout and calculate effective timeout once during initialization
        long sessionTimeoutMs = parseSessionTimeout(sessionTimeout);
        this.effectiveTimeoutMs = Math.min(asyncRequestTimeoutMs, sessionTimeoutMs);
        log.debug(
                "Job executor configured with effective timeout of {} ms", this.effectiveTimeoutMs);
    }

    /**
     * Run a job either asynchronously or synchronously
     *
     * @param async Whether to run the job asynchronously
     * @param work The work to be done
     * @return The response
     */
    public ResponseEntity<?> runJobGeneric(boolean async, Supplier<Object> work) {
        return runJobGeneric(async, work, -1);
    }

    /**
     * Run a job either asynchronously or synchronously with a custom timeout
     *
     * @param async Whether to run the job asynchronously
     * @param work The work to be done
     * @param customTimeoutMs Custom timeout in milliseconds, or -1 to use the default
     * @return The response
     */
    public ResponseEntity<?> runJobGeneric(
            boolean async, Supplier<Object> work, long customTimeoutMs) {
        return runJobGeneric(async, work, customTimeoutMs, false, 50);
    }

    /**
     * Run a job either asynchronously or synchronously with custom parameters
     *
     * @param async Whether to run the job asynchronously
     * @param work The work to be done
     * @param customTimeoutMs Custom timeout in milliseconds, or -1 to use the default
     * @param queueable Whether this job can be queued when system resources are limited
     * @param resourceWeight The resource weight of this job (1-100)
     * @return The response
     */
    public ResponseEntity<?> runJobGeneric(
            boolean async,
            Supplier<Object> work,
            long customTimeoutMs,
            boolean queueable,
            int resourceWeight) {
        String jobId = UUID.randomUUID().toString();

        // Store the job ID in the request for potential use by other components
        if (request != null) {
            request.setAttribute("jobId", jobId);

            // Also track this job ID in the user's session for authorization purposes
            // This ensures users can only cancel their own jobs
            if (request.getSession() != null) {
                @SuppressWarnings("unchecked")
                java.util.Set<String> userJobIds =
                        (java.util.Set<String>) request.getSession().getAttribute("userJobIds");

                if (userJobIds == null) {
                    userJobIds = new java.util.concurrent.ConcurrentSkipListSet<>();
                    request.getSession().setAttribute("userJobIds", userJobIds);
                }

                userJobIds.add(jobId);
                log.debug("Added job ID {} to user session", jobId);
            }
        }

        // Determine which timeout to use
        long timeoutToUse = customTimeoutMs > 0 ? customTimeoutMs : effectiveTimeoutMs;

        log.debug(
                "Running job with ID: {}, async: {}, timeout: {}ms, queueable: {}, weight: {}",
                jobId,
                async,
                timeoutToUse,
                queueable,
                resourceWeight);

        // Check if we need to queue this job based on resource availability
        boolean shouldQueue =
                queueable
                        && async
                        && // Only async jobs can be queued
                        resourceMonitor.shouldQueueJob(resourceWeight);

        if (shouldQueue) {
            // Queue the job instead of executing immediately
            log.debug(
                    "Queueing job {} due to resource constraints (weight: {})",
                    jobId,
                    resourceWeight);

            taskManager.createTask(jobId);

            // Create a specialized wrapper that updates the TaskManager
            Supplier<Object> wrappedWork =
                    () -> {
                        try {
                            Object result = work.get();
                            processJobResult(jobId, result);
                            return result;
                        } catch (Exception e) {
                            log.error(
                                    "Error executing queued job {}: {}", jobId, e.getMessage(), e);
                            taskManager.setError(jobId, e.getMessage());
                            throw e;
                        }
                    };

            // Queue the job and get the future
            CompletableFuture<ResponseEntity<?>> future =
                    jobQueue.queueJob(jobId, resourceWeight, wrappedWork, timeoutToUse);

            // Return immediately with job ID
            return ResponseEntity.ok().body(new JobResponse<>(true, jobId, null));
        } else if (async) {
            taskManager.createTask(jobId);
            executor.execute(
                    () -> {
                        try {
                            log.debug(
                                    "Running async job {} with timeout {} ms", jobId, timeoutToUse);

                            // Execute with timeout
                            Object result = executeWithTimeout(() -> work.get(), timeoutToUse);
                            processJobResult(jobId, result);
                        } catch (TimeoutException te) {
                            log.error("Job {} timed out after {} ms", jobId, timeoutToUse);
                            taskManager.setError(jobId, "Job timed out");
                        } catch (Exception e) {
                            log.error("Error executing job {}: {}", jobId, e.getMessage(), e);
                            taskManager.setError(jobId, e.getMessage());
                        }
                    });

            return ResponseEntity.ok().body(new JobResponse<>(true, jobId, null));
        } else {
            try {
                log.debug("Running sync job with timeout {} ms", timeoutToUse);

                // Execute with timeout
                Object result = executeWithTimeout(() -> work.get(), timeoutToUse);

                // If the result is already a ResponseEntity, return it directly
                if (result instanceof ResponseEntity) {
                    return (ResponseEntity<?>) result;
                }

                // Process different result types
                return handleResultForSyncJob(result);
            } catch (TimeoutException te) {
                log.error("Synchronous job timed out after {} ms", timeoutToUse);
                return ResponseEntity.internalServerError()
                        .body(Map.of("error", "Job timed out after " + timeoutToUse + " ms"));
            } catch (Exception e) {
                log.error("Error executing synchronous job: {}", e.getMessage(), e);
                // Construct a JSON error response
                return ResponseEntity.internalServerError()
                        .body(Map.of("error", "Job failed: " + e.getMessage()));
            }
        }
    }

    /**
     * Process the result of an asynchronous job
     *
     * @param jobId The job ID
     * @param result The result
     */
    private void processJobResult(String jobId, Object result) {
        try {
            if (result instanceof byte[]) {
                // Store byte array directly to disk to avoid double memory consumption
                String fileId = fileStorage.storeBytes((byte[]) result, "result.pdf");
                taskManager.setFileResult(jobId, fileId, "result.pdf", "application/pdf");
                log.debug("Stored byte[] result with fileId: {}", fileId);

                // Let the byte array get collected naturally in the next GC cycle
                // We don't need to force System.gc() which can be harmful
            } else if (result instanceof ResponseEntity) {
                ResponseEntity<?> response = (ResponseEntity<?>) result;
                Object body = response.getBody();

                if (body instanceof byte[]) {
                    // Extract filename from content-disposition header if available
                    String filename = "result.pdf";
                    String contentType = "application/pdf";

                    if (response.getHeaders().getContentDisposition() != null) {
                        String disposition =
                                response.getHeaders().getContentDisposition().toString();
                        if (disposition.contains("filename=")) {
                            filename =
                                    disposition.substring(
                                            disposition.indexOf("filename=") + 9,
                                            disposition.lastIndexOf("\""));
                        }
                    }

                    MediaType mediaType = response.getHeaders().getContentType();

                    if (mediaType != null) {
                        contentType = mediaType.toString();
                    }

                    // Store byte array directly to disk
                    String fileId = fileStorage.storeBytes((byte[]) body, filename);
                    taskManager.setFileResult(jobId, fileId, filename, contentType);
                    log.debug("Stored ResponseEntity<byte[]> result with fileId: {}", fileId);

                    // Let the GC handle the memory naturally
                } else {
                    // Check if the response body contains a fileId
                    if (body != null && body.toString().contains("fileId")) {
                        try {
                            // Try to extract fileId using reflection
                            java.lang.reflect.Method getFileId =
                                    body.getClass().getMethod("getFileId");
                            String fileId = (String) getFileId.invoke(body);

                            if (fileId != null && !fileId.isEmpty()) {
                                // Try to get filename and content type
                                String filename = "result.pdf";
                                String contentType = "application/pdf";

                                try {
                                    java.lang.reflect.Method getOriginalFileName =
                                            body.getClass().getMethod("getOriginalFilename");
                                    String origName = (String) getOriginalFileName.invoke(body);
                                    if (origName != null && !origName.isEmpty()) {
                                        filename = origName;
                                    }
                                } catch (Exception e) {
                                    log.debug(
                                            "Could not get original filename: {}", e.getMessage());
                                }

                                try {
                                    java.lang.reflect.Method getContentType =
                                            body.getClass().getMethod("getContentType");
                                    String ct = (String) getContentType.invoke(body);
                                    if (ct != null && !ct.isEmpty()) {
                                        contentType = ct;
                                    }
                                } catch (Exception e) {
                                    log.debug("Could not get content type: {}", e.getMessage());
                                }

                                taskManager.setFileResult(jobId, fileId, filename, contentType);
                                log.debug("Extracted fileId from response body: {}", fileId);

                                taskManager.setComplete(jobId);
                                return;
                            }
                        } catch (Exception e) {
                            log.debug(
                                    "Failed to extract fileId from response body: {}",
                                    e.getMessage());
                        }
                    }

                    // Store generic result
                    taskManager.setResult(jobId, body);
                }
            } else if (result instanceof MultipartFile) {
                MultipartFile file = (MultipartFile) result;
                String fileId = fileStorage.storeFile(file);
                taskManager.setFileResult(
                        jobId, fileId, file.getOriginalFilename(), file.getContentType());
                log.debug("Stored MultipartFile result with fileId: {}", fileId);
            } else {
                // Check if result has a fileId field
                if (result != null) {
                    try {
                        // Try to extract fileId using reflection
                        java.lang.reflect.Method getFileId =
                                result.getClass().getMethod("getFileId");
                        String fileId = (String) getFileId.invoke(result);

                        if (fileId != null && !fileId.isEmpty()) {
                            // Try to get filename and content type
                            String filename = "result.pdf";
                            String contentType = "application/pdf";

                            try {
                                java.lang.reflect.Method getOriginalFileName =
                                        result.getClass().getMethod("getOriginalFilename");
                                String origName = (String) getOriginalFileName.invoke(result);
                                if (origName != null && !origName.isEmpty()) {
                                    filename = origName;
                                }
                            } catch (Exception e) {
                                log.debug("Could not get original filename: {}", e.getMessage());
                            }

                            try {
                                java.lang.reflect.Method getContentType =
                                        result.getClass().getMethod("getContentType");
                                String ct = (String) getContentType.invoke(result);
                                if (ct != null && !ct.isEmpty()) {
                                    contentType = ct;
                                }
                            } catch (Exception e) {
                                log.debug("Could not get content type: {}", e.getMessage());
                            }

                            taskManager.setFileResult(jobId, fileId, filename, contentType);
                            log.debug("Extracted fileId from result object: {}", fileId);

                            taskManager.setComplete(jobId);
                            return;
                        }
                    } catch (Exception e) {
                        log.debug(
                                "Failed to extract fileId from result object: {}", e.getMessage());
                    }
                }

                // Default case: store the result as is
                taskManager.setResult(jobId, result);
            }

            taskManager.setComplete(jobId);
        } catch (Exception e) {
            log.error("Error processing job result: {}", e.getMessage(), e);
            taskManager.setError(jobId, "Error processing result: " + e.getMessage());
        }
    }

    /**
     * Handle different result types for synchronous jobs
     *
     * @param result The result object
     * @return The appropriate ResponseEntity
     * @throws IOException If there is an error processing the result
     */
    private ResponseEntity<?> handleResultForSyncJob(Object result) throws IOException {
        if (result instanceof byte[]) {
            // Return byte array as PDF
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_PDF)
                    .header(
                            HttpHeaders.CONTENT_DISPOSITION,
                            "form-data; name=\"attachment\"; filename=\"result.pdf\"")
                    .body(result);
        } else if (result instanceof MultipartFile) {
            // Return MultipartFile content
            MultipartFile file = (MultipartFile) result;
            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType(file.getContentType()))
                    .header(
                            HttpHeaders.CONTENT_DISPOSITION,
                            "form-data; name=\"attachment\"; filename=\""
                                    + file.getOriginalFilename()
                                    + "\"")
                    .body(file.getBytes());
        } else {
            // Default case: return as JSON
            return ResponseEntity.ok(result);
        }
    }

    /**
     * Parse session timeout string (e.g., "30m", "1h") to milliseconds
     *
     * @param timeout The timeout string
     * @return The timeout in milliseconds
     */
    private long parseSessionTimeout(String timeout) {
        if (timeout == null || timeout.isEmpty()) {
            return 30 * 60 * 1000; // Default: 30 minutes
        }

        try {
            String value = timeout.replaceAll("[^\\d.]", "");
            String unit = timeout.replaceAll("[\\d.]", "");

            double numericValue = Double.parseDouble(value);

            return switch (unit.toLowerCase()) {
                case "s" -> (long) (numericValue * 1000);
                case "m" -> (long) (numericValue * 60 * 1000);
                case "h" -> (long) (numericValue * 60 * 60 * 1000);
                case "d" -> (long) (numericValue * 24 * 60 * 60 * 1000);
                default -> (long) (numericValue * 60 * 1000); // Default to minutes
            };
        } catch (Exception e) {
            log.warn("Could not parse session timeout '{}', using default", timeout);
            return 30 * 60 * 1000; // Default: 30 minutes
        }
    }

    /**
     * Execute a supplier with a timeout
     *
     * @param supplier The supplier to execute
     * @param timeoutMs The timeout in milliseconds
     * @return The result from the supplier
     * @throws TimeoutException If the execution times out
     * @throws Exception If the supplier throws an exception
     */
    private <T> T executeWithTimeout(Supplier<T> supplier, long timeoutMs)
            throws TimeoutException, Exception {
        // Use the same executor as other async jobs for consistency
        // This ensures all operations run on the same thread pool
        java.util.concurrent.CompletableFuture<T> future =
                java.util.concurrent.CompletableFuture.supplyAsync(supplier, executor);

        try {
            return future.get(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (java.util.concurrent.TimeoutException e) {
            future.cancel(true);
            throw new TimeoutException("Execution timed out after " + timeoutMs + " ms");
        } catch (java.util.concurrent.ExecutionException e) {
            throw (Exception) e.getCause();
        } catch (java.util.concurrent.CancellationException e) {
            throw new Exception("Execution was cancelled", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new Exception("Execution was interrupted", e);
        }
    }
}
