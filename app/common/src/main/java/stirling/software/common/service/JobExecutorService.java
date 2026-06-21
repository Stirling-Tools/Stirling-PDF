package stirling.software.common.service;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.Supplier;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import jakarta.servlet.http.HttpServletRequest;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.job.JobResponse;
import stirling.software.common.util.ExecutorFactory;
import stirling.software.common.util.RegexPatternUtils;

/** Service for executing jobs asynchronously or synchronously */
@Service
@Slf4j
public class JobExecutorService {

    private final TaskManager taskManager;
    private final FileStorage fileStorage;
    private final HttpServletRequest request;
    private final ResourceMonitor resourceMonitor;
    private final JobQueue jobQueue;
    private final ExecutorService executor = ExecutorFactory.newVirtualThreadExecutor();
    private final long effectiveTimeoutMs;

    @Autowired(required = false)
    private JobOwnershipService jobOwnershipService;

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

        long sessionTimeoutMs = parseSessionTimeout(sessionTimeout);
        this.effectiveTimeoutMs = Math.min(asyncRequestTimeoutMs, sessionTimeoutMs);
        log.debug(
                "Job executor configured with effective timeout of {} ms", this.effectiveTimeoutMs);
    }

    public ResponseEntity<?> runJobGeneric(boolean async, Supplier<Object> work) {
        return runJobGeneric(async, work, -1);
    }

    public ResponseEntity<?> runJobGeneric(
            boolean async, Supplier<Object> work, long customTimeoutMs) {
        return runJobGeneric(async, work, customTimeoutMs, false, 50);
    }

    public ResponseEntity<?> runJobGeneric(
            boolean async,
            Supplier<Object> work,
            long customTimeoutMs,
            boolean queueable,
            int resourceWeight) {
        String baseJobId = UUID.randomUUID().toString();
        String scopedJobKey = getScopedJobKey(baseJobId);

        log.debug("Generated jobId: {} (base: {})", scopedJobKey, baseJobId);

        if (request != null) {
            request.setAttribute("jobId", scopedJobKey);
        }

        String jobId = scopedJobKey;

        final String jobOwner =
                jobOwnershipService != null
                        ? jobOwnershipService.getCurrentUserId().orElse(null)
                        : null;

        long timeoutToUse = customTimeoutMs > 0 ? customTimeoutMs : effectiveTimeoutMs;

        log.debug(
                "Running job with ID: {}, async: {}, timeout: {}ms, queueable: {}, weight: {}",
                jobId,
                async,
                timeoutToUse,
                queueable,
                resourceWeight);

        boolean shouldQueue =
                queueable
                        && async
                        && // Only async jobs can be queued
                        resourceMonitor.shouldQueueJob(resourceWeight);

        if (shouldQueue) {
            log.debug(
                    "Queueing job {} due to resource constraints (weight: {})",
                    jobId,
                    resourceWeight);

            taskManager.createTask(jobId);

            final String capturedJobIdForQueue = jobId;
            Supplier<Object> wrappedWork =
                    () -> {
                        try {
                            stirling.software.common.util.JobContext.setJobId(
                                    capturedJobIdForQueue);
                            stirling.software.common.util.JobContext.setOwner(jobOwner);
                            Object result = work.get();
                            processJobResult(capturedJobIdForQueue, result);
                            return result;
                        } catch (Exception e) {
                            log.error(
                                    "Error executing queued job {}: {}",
                                    capturedJobIdForQueue,
                                    e.getMessage(),
                                    e);
                            taskManager.setError(capturedJobIdForQueue, e.getMessage());
                            throw e;
                        } finally {
                            stirling.software.common.util.JobContext.clear();
                        }
                    };

            CompletableFuture<ResponseEntity<?>> future =
                    jobQueue.queueJob(jobId, resourceWeight, wrappedWork, timeoutToUse);

            return ResponseEntity.ok().body(new JobResponse<>(true, jobId, null));
        } else if (async) {
            taskManager.createTask(jobId);

            final String capturedJobId = jobId;

            executor.execute(
                    () -> {
                        try {
                            log.debug(
                                    "Running async job {} with timeout {} ms",
                                    capturedJobId,
                                    timeoutToUse);

                            stirling.software.common.util.JobContext.setJobId(capturedJobId);
                            stirling.software.common.util.JobContext.setOwner(jobOwner);
                            Object result = executeWithTimeout(() -> work.get(), timeoutToUse);
                            processJobResult(capturedJobId, result);
                        } catch (TimeoutException te) {
                            log.error("Job {} timed out after {} ms", jobId, timeoutToUse);
                            taskManager.setError(jobId, "Job timed out");
                        } catch (Exception e) {
                            log.error("Error executing job {}: {}", jobId, e.getMessage(), e);
                            taskManager.setError(jobId, e.getMessage());
                        } finally {
                            stirling.software.common.util.JobContext.clear();
                        }
                    });

            return ResponseEntity.ok().body(new JobResponse<>(true, jobId, null));
        } else {
            try {
                log.debug("Running sync job with timeout {} ms", timeoutToUse);

                stirling.software.common.util.JobContext.setJobId(jobId);
                Object result = executeWithTimeout(() -> work.get(), timeoutToUse);

                if (result instanceof ResponseEntity) {
                    return (ResponseEntity<?>) result;
                }

                return handleResultForSyncJob(result);
            } catch (TimeoutException te) {
                log.error("Synchronous job timed out after {} ms", timeoutToUse);
                return ResponseEntity.internalServerError()
                        .body(Map.of("error", "Job timed out after " + timeoutToUse + " ms"));
            } catch (RuntimeException e) {
                Throwable cause = e.getCause();
                if (e instanceof IllegalArgumentException
                        || cause
                                instanceof
                                stirling.software.common.util.ExceptionUtils.BaseAppException
                        || cause
                                instanceof
                                stirling.software.common.util.ExceptionUtils
                                        .BaseValidationException) {
                    throw e;
                }
                log.error("Error executing synchronous job: {}", e.getMessage(), e);
                return ResponseEntity.internalServerError()
                        .body(Map.of("error", "Job failed: " + e.getMessage()));
            } catch (Exception e) {
                log.error("Error executing synchronous job: {}", e.getMessage(), e);
                return ResponseEntity.internalServerError()
                        .body(Map.of("error", "Job failed: " + e.getMessage()));
            } finally {
                stirling.software.common.util.JobContext.clear();
            }
        }
    }

    private void processJobResult(String jobId, Object result) {
        try {
            if (result instanceof byte[]) {
                String fileId = fileStorage.storeBytes((byte[]) result, "result.pdf");
                taskManager.setFileResult(
                        jobId, fileId, "result.pdf", MediaType.APPLICATION_PDF_VALUE);
                log.debug("Stored byte[] result with fileId: {}", fileId);
            } else if (result instanceof ResponseEntity) {
                ResponseEntity<?> response = (ResponseEntity<?>) result;
                Object body = response.getBody();

                if (body instanceof byte[]) {
                    String filename = extractResponseFilename(response);
                    String contentType = extractResponseContentType(response);

                    String fileId = fileStorage.storeBytes((byte[]) body, filename);
                    taskManager.setFileResult(jobId, fileId, filename, contentType);
                    log.debug("Stored ResponseEntity<byte[]> result with fileId: {}", fileId);
                } else if (body instanceof StreamingResponseBody streamingBody) {
                    String filename = extractResponseFilename(response);
                    String contentType = extractResponseContentType(response);

                    String fileId = fileStorage.storeFromStreamingBody(streamingBody, filename);
                    taskManager.setFileResult(jobId, fileId, filename, contentType);
                    log.debug(
                            "Stored ResponseEntity<StreamingResponseBody> result with fileId: {}",
                            fileId);
                } else if (body instanceof Resource resource) {
                    String filename = extractResponseFilename(response);
                    String contentType = extractResponseContentType(response);

                    String fileId = fileStorage.storeFromResource(resource, filename);
                    taskManager.setFileResult(jobId, fileId, filename, contentType);
                    log.debug("Stored ResponseEntity<Resource> result with fileId: {}", fileId);
                } else {
                    if (body != null && body.toString().contains("fileId")) {
                        try {
                            java.lang.reflect.Method getFileId =
                                    body.getClass().getMethod("getFileId");
                            String fileId = (String) getFileId.invoke(body);

                            if (fileId != null && !fileId.isEmpty()) {
                                String filename = "result.pdf";
                                String contentType = MediaType.APPLICATION_PDF_VALUE;

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

                    taskManager.setResult(jobId, body);
                }
            } else if (result instanceof MultipartFile file) {
                String fileId = fileStorage.storeFile(file);
                taskManager.setFileResult(
                        jobId, fileId, file.getOriginalFilename(), file.getContentType());
                log.debug("Stored MultipartFile result with fileId: {}", fileId);
            } else {
                if (result != null) {
                    try {
                        java.lang.reflect.Method getFileId =
                                result.getClass().getMethod("getFileId");
                        String fileId = (String) getFileId.invoke(result);

                        if (fileId != null && !fileId.isEmpty()) {
                            String filename = "result.pdf";
                            String contentType = MediaType.APPLICATION_PDF_VALUE;

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

                taskManager.setResult(jobId, result);
            }

            taskManager.setComplete(jobId);
        } catch (Exception e) {
            log.error("Error processing job result: {}", e.getMessage(), e);
            taskManager.setError(jobId, "Error processing result: " + e.getMessage());
        }
    }

    private ResponseEntity<?> handleResultForSyncJob(Object result) throws IOException {
        if (result instanceof byte[]) {
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_PDF)
                    .header(
                            HttpHeaders.CONTENT_DISPOSITION,
                            "form-data; name=\"attachment\"; filename=\"result.pdf\"")
                    .body(result);
        } else if (result instanceof MultipartFile file) {
            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType(file.getContentType()))
                    .header(
                            HttpHeaders.CONTENT_DISPOSITION,
                            "form-data; name=\"attachment\"; filename=\""
                                    + file.getOriginalFilename()
                                    + "\"")
                    .body(file.getBytes());
        } else {
            return ResponseEntity.ok(result);
        }
    }

    private static String extractResponseFilename(ResponseEntity<?> response) {
        if (response.getHeaders().getContentDisposition() != null) {
            String filename = response.getHeaders().getContentDisposition().getFilename();
            if (filename != null && !filename.isEmpty()) {
                return filename;
            }
        }
        return "result.pdf";
    }

    private static String extractResponseContentType(ResponseEntity<?> response) {
        MediaType mediaType = response.getHeaders().getContentType();
        return mediaType != null ? mediaType.toString() : MediaType.APPLICATION_PDF_VALUE;
    }

    private long parseSessionTimeout(String timeout) {
        if (timeout == null || timeout.isEmpty()) {
            return 30 * 60 * 1000;
        }

        try {
            String value =
                    RegexPatternUtils.getInstance()
                            .getNonDigitDotPattern()
                            .matcher(timeout)
                            .replaceAll("");
            String unit =
                    RegexPatternUtils.getInstance()
                            .getDigitDotPattern()
                            .matcher(timeout)
                            .replaceAll("");

            double numericValue = Double.parseDouble(value);

            return switch (unit.toLowerCase()) {
                case "s" -> (long) (numericValue * 1000);
                case "m" -> (long) (numericValue * 60 * 1000);
                case "h" -> (long) (numericValue * 60 * 60 * 1000);
                case "d" -> (long) (numericValue * 24 * 60 * 60 * 1000);
                default -> (long) (numericValue * 60 * 1000);
            };
        } catch (Exception e) {
            log.warn("Could not parse session timeout '{}', using default", timeout);
            return 30 * 60 * 1000;
        }
    }

    private <T> T executeWithTimeout(Supplier<T> supplier, long timeoutMs)
            throws TimeoutException, Exception {
        String currentJobId = stirling.software.common.util.JobContext.getJobId();

        java.util.concurrent.CompletableFuture<T> future =
                java.util.concurrent.CompletableFuture.supplyAsync(
                        () -> {
                            if (currentJobId != null) {
                                stirling.software.common.util.JobContext.setJobId(currentJobId);
                            }
                            try {
                                return supplier.get();
                            } finally {
                                if (currentJobId != null) {
                                    stirling.software.common.util.JobContext.clear();
                                }
                            }
                        },
                        executor);

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

    private String getScopedJobKey(String baseJobId) {
        if (jobOwnershipService != null) {
            return jobOwnershipService.createScopedJobKey(baseJobId);
        }
        return baseJobId;
    }
}
