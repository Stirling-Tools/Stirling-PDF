package stirling.software.common.aop;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.*;
import org.slf4j.MDC;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import jakarta.servlet.http.HttpServletRequest;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.JobExecutorService;

@Aspect
@Component
@RequiredArgsConstructor
@Slf4j
@Order(20) // Lower precedence - executes AFTER audit aspects populate MDC
public class AutoJobAspect {

    private static final Duration RETRY_BASE_DELAY = Duration.ofMillis(100);

    private final JobExecutorService jobExecutorService;
    private final HttpServletRequest request;
    private final FileStorage fileStorage;

    @Around("@annotation(autoJobPostMapping)")
    public Object wrapWithJobExecution(
            ProceedingJoinPoint joinPoint, AutoJobPostMapping autoJobPostMapping) throws Exception {
        // This aspect will run before any audit aspects due to @Order(0)
        // Extract parameters from the request and annotation
        boolean async = Boolean.parseBoolean(request.getParameter("async"));
        log.debug(
                "AutoJobAspect: Processing {} {} with async={}",
                request.getMethod(),
                request.getRequestURI(),
                async);
        long timeout = autoJobPostMapping.timeout();
        int retryCount = autoJobPostMapping.retryCount();
        boolean trackProgress = autoJobPostMapping.trackProgress();

        log.debug(
                "AutoJobPostMapping execution with async={}, timeout={}, retryCount={},"
                        + " trackProgress={}",
                async,
                timeout > 0 ? timeout : "default",
                retryCount,
                trackProgress);

        // Process arguments in-place to avoid type mismatch issues
        Object[] args = processArgsInPlace(joinPoint.getArgs(), async);

        // Extract queueable and resourceWeight parameters and validate
        boolean queueable = autoJobPostMapping.queueable();
        int resourceWeight = Math.max(1, Math.min(100, autoJobPostMapping.resourceWeight()));

        // Integrate with the JobExecutorService
        if (retryCount <= 1) {
            // No retries needed, simple execution
            return jobExecutorService.runJobGeneric(
                    async,
                    wrapWithMDC(
                            () -> {
                                try {
                                    // Note: Progress tracking is handled in
                                    // TaskManager/JobExecutorService
                                    // The trackProgress flag controls whether detailed progress is
                                    // stored
                                    // for REST API queries, not WebSocket notifications
                                    return joinPoint.proceed(args);
                                } catch (Throwable ex) {
                                    log.error(
                                            "AutoJobAspect caught exception during job execution: {}",
                                            ex.getMessage(),
                                            ex);
                                    // Rethrow RuntimeException as-is to preserve exception type
                                    if (ex instanceof RuntimeException) {
                                        throw (RuntimeException) ex;
                                    }
                                    // Wrap checked exceptions - GlobalExceptionHandler will unwrap
                                    // BaseAppException
                                    throw new RuntimeException(ex);
                                }
                            }),
                    timeout,
                    queueable,
                    resourceWeight);
        } else {
            // Use retry logic
            return executeWithRetries(
                    joinPoint,
                    args,
                    async,
                    timeout,
                    retryCount,
                    trackProgress,
                    queueable,
                    resourceWeight);
        }
    }

    private Object executeWithRetries(
            ProceedingJoinPoint joinPoint,
            Object[] args,
            boolean async,
            long timeout,
            int maxRetries,
            boolean trackProgress,
            boolean queueable,
            int resourceWeight)
            throws Exception {

        // Keep jobId reference for progress tracking in TaskManager
        AtomicReference<String> jobIdRef = new AtomicReference<>();

        return jobExecutorService.runJobGeneric(
                async,
                wrapWithMDC(
                        () -> {
                            // Use iterative approach instead of recursion to avoid stack overflow
                            Throwable lastException = null;

                            // Attempt counter starts at 1 for first try
                            for (int currentAttempt = 1;
                                    currentAttempt <= maxRetries;
                                    currentAttempt++) {
                                try {
                                    if (trackProgress && async) {
                                        // Get jobId for progress tracking in TaskManager
                                        // This enables REST API progress queries, not WebSocket
                                        if (jobIdRef.get() == null) {
                                            jobIdRef.set(getJobIdFromContext());
                                        }
                                        String jobId = jobIdRef.get();
                                        if (jobId != null) {
                                            log.debug(
                                                    "Tracking progress for job {} (attempt {}/{})",
                                                    jobId,
                                                    currentAttempt,
                                                    maxRetries);
                                            // Progress is tracked in TaskManager for REST API
                                            // access
                                            // No WebSocket notifications sent here
                                        }
                                    }

                                    // Attempt to execute the operation
                                    return joinPoint.proceed(args);

                                } catch (Throwable ex) {
                                    lastException = ex;
                                    log.error(
                                            "AutoJobAspect caught exception during job execution (attempt"
                                                    + " {}/{}): {}",
                                            currentAttempt,
                                            maxRetries,
                                            ex.getMessage(),
                                            ex);

                                    // Check if we should retry
                                    if (currentAttempt < maxRetries) {
                                        log.info(
                                                "Retrying operation, attempt {}/{}",
                                                currentAttempt + 1,
                                                maxRetries);

                                        if (trackProgress && async) {
                                            String jobId = jobIdRef.get();
                                            if (jobId != null) {
                                                log.debug(
                                                        "Recording retry attempt for job {} in TaskManager",
                                                        jobId);
                                                // Retry info is tracked in TaskManager for REST API
                                                // access
                                            }
                                        }

                                        // Use sleep for retry delay
                                        // For sync jobs, both sleep and async are blocking at this
                                        // point
                                        // For async jobs, the delay occurs in the executor thread
                                        long delayMs = RETRY_BASE_DELAY.toMillis() * currentAttempt;

                                        try {
                                            Thread.sleep(delayMs);
                                        } catch (InterruptedException e) {
                                            Thread.currentThread().interrupt();
                                            log.debug(
                                                    "Retry delay interrupted for attempt {}/{}",
                                                    currentAttempt,
                                                    maxRetries);
                                            break;
                                        }
                                    } else {
                                        // No more retries, we'll throw the exception after the loop
                                        break;
                                    }
                                }
                            }

                            // If we get here, all retries failed
                            if (lastException != null) {
                                // Rethrow RuntimeException as-is to preserve exception type
                                if (lastException instanceof RuntimeException) {
                                    throw (RuntimeException) lastException;
                                }
                                // Wrap checked exceptions - GlobalExceptionHandler will unwrap
                                // BaseAppException
                                throw new RuntimeException(
                                        "Job failed after "
                                                + maxRetries
                                                + " attempts: "
                                                + lastException.getMessage(),
                                        lastException);
                            }

                            // This should never happen if lastException is properly tracked
                            throw new RuntimeException("Job failed but no exception was recorded");
                        }),
                timeout,
                queueable,
                resourceWeight);
    }

    /**
     * Processes arguments in-place to handle file resolution and async file persistence. This
     * approach avoids type mismatch issues by modifying the original objects directly.
     *
     * @param originalArgs The original arguments
     * @param async Whether this is an async operation
     * @return The original array with processed arguments
     */
    private Object[] processArgsInPlace(Object[] originalArgs, boolean async) {
        if (originalArgs == null || originalArgs.length == 0) {
            return originalArgs;
        }

        // Process all arguments in-place
        for (int i = 0; i < originalArgs.length; i++) {
            Object arg = originalArgs[i];

            if (arg instanceof PDFFile pdfFile) {
                // Case 1: fileId is provided but no fileInput
                if (pdfFile.getFileInput() == null && pdfFile.getFileId() != null) {
                    try {
                        log.debug("Using fileId {} to get file content", pdfFile.getFileId());
                        MultipartFile file = fileStorage.retrieveFile(pdfFile.getFileId());
                        pdfFile.setFileInput(file);
                    } catch (Exception e) {
                        throw new RuntimeException(
                                "Failed to resolve file by ID: " + pdfFile.getFileId(), e);
                    }
                }
                // Case 2: For async requests, we need to make a copy of the MultipartFile
                else if (async && pdfFile.getFileInput() != null) {
                    try {
                        log.debug("Making persistent copy of uploaded file for async processing");
                        MultipartFile originalFile = pdfFile.getFileInput();
                        String fileId = fileStorage.storeFile(originalFile);

                        // Store the fileId for later reference
                        pdfFile.setFileId(fileId);

                        // Replace the original MultipartFile with our persistent copy
                        MultipartFile persistentFile = fileStorage.retrieveFile(fileId);
                        pdfFile.setFileInput(persistentFile);

                        log.debug("Created persistent file copy with fileId: {}", fileId);
                    } catch (IOException e) {
                        throw new RuntimeException(
                                "Failed to create persistent copy of uploaded file", e);
                    }
                }
            }
        }

        return originalArgs;
    }

    private String getJobIdFromContext() {
        try {
            return (String) request.getAttribute("jobId");
        } catch (Exception e) {
            log.debug("Could not retrieve job ID from context: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Wraps a supplier to propagate MDC context to background threads. Captures MDC on request
     * thread and restores it in the background thread. Ensures proper cleanup to prevent context
     * leakage across jobs in thread pools.
     */
    private Supplier<Object> wrapWithMDC(Supplier<Object> supplier) {
        final Map<String, String> captured = MDC.getCopyOfContextMap();
        return () -> {
            final Map<String, String> previous = MDC.getCopyOfContextMap();
            try {
                // Set the captured context (or clear if none was captured)
                if (captured != null) {
                    MDC.setContextMap(captured);
                } else {
                    MDC.clear();
                }
                return supplier.get();
            } finally {
                // Restore previous state (or clear if there was none)
                if (previous != null) {
                    MDC.setContextMap(previous);
                } else {
                    MDC.clear();
                }
            }
        };
    }
}
