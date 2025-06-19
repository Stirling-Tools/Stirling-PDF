package stirling.software.common.aop;

import java.io.IOException;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.beans.BeanUtils;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.*;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import jakarta.servlet.http.HttpServletRequest;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.FileOrUploadService;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.JobExecutorService;

@Aspect
@Component
@RequiredArgsConstructor
@Slf4j
public class AutoJobAspect {

    private static final Duration RETRY_BASE_DELAY = Duration.ofMillis(100);
    
    private final JobExecutorService jobExecutorService;
    private final HttpServletRequest request;
    private final FileOrUploadService fileOrUploadService;
    private final FileStorage fileStorage;

    @Around("@annotation(autoJobPostMapping)")
    public Object wrapWithJobExecution(
            ProceedingJoinPoint joinPoint, AutoJobPostMapping autoJobPostMapping) {
        // Extract parameters from the request and annotation
        boolean async = Boolean.parseBoolean(request.getParameter("async"));
        long timeout = autoJobPostMapping.timeout();
        int retryCount = autoJobPostMapping.retryCount();
        boolean trackProgress = autoJobPostMapping.trackProgress();

        log.debug(
                "AutoJobPostMapping execution with async={}, timeout={}, retryCount={}, trackProgress={}",
                async,
                timeout > 0 ? timeout : "default",
                retryCount,
                trackProgress);

        // Copy and process arguments to avoid mutating the original objects
        Object[] args = copyAndProcessArgs(joinPoint.getArgs(), async);

        // Extract queueable and resourceWeight parameters and validate
        boolean queueable = autoJobPostMapping.queueable();
        int resourceWeight = Math.max(1, Math.min(100, autoJobPostMapping.resourceWeight()));

        // Integrate with the JobExecutorService
        if (retryCount <= 1) {
            // No retries needed, simple execution
            return jobExecutorService.runJobGeneric(
                    async,
                    () -> {
                        try {
                            // Note: Progress tracking is handled in TaskManager/JobExecutorService
                            // The trackProgress flag controls whether detailed progress is stored
                            // for REST API queries, not WebSocket notifications
                            return joinPoint.proceed(args);
                        } catch (Throwable ex) {
                            log.error(
                                    "AutoJobAspect caught exception during job execution: {}",
                                    ex.getMessage(),
                                    ex);
                            throw new RuntimeException(ex);
                        }
                    },
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
            int resourceWeight) {

        // Keep jobId reference for progress tracking in TaskManager
        AtomicReference<String> jobIdRef = new AtomicReference<>();

        return jobExecutorService.runJobGeneric(
                async,
                () -> {
                    // Use iterative approach instead of recursion to avoid stack overflow
                    Throwable lastException = null;
                    
                    // Attempt counter starts at 1 for first try
                    for (int currentAttempt = 1; currentAttempt <= maxRetries; currentAttempt++) {
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
                                    // Progress is tracked in TaskManager for REST API access
                                    // No WebSocket notifications sent here
                                }
                            }

                            // Attempt to execute the operation
                            return joinPoint.proceed(args);
                            
                        } catch (Throwable ex) {
                            lastException = ex;
                            log.error(
                                    "AutoJobAspect caught exception during job execution (attempt {}/{}): {}",
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
                                        // Retry info is tracked in TaskManager for REST API access
                                    }
                                }

                                // Use non-blocking delay for all retry attempts to avoid blocking threads
                                // For sync jobs this avoids starving the tomcat thread pool under load
                                long delayMs = RETRY_BASE_DELAY.toMillis() * currentAttempt;
                                
                                // Execute the retry after a delay through the JobExecutorService 
                                // rather than blocking the current thread with sleep
                                CompletableFuture<Object> delayedRetry = new CompletableFuture<>();
                                
                                // Use a delayed executor for non-blocking delay
                                CompletableFuture.delayedExecutor(delayMs, TimeUnit.MILLISECONDS)
                                    .execute(() -> {
                                        // Continue the retry loop in the next iteration
                                        // We can't return from here directly since we're in a Runnable
                                        delayedRetry.complete(null);
                                    });
                                
                                // Wait for the delay to complete before continuing
                                try {
                                    delayedRetry.join();
                                } catch (Exception e) {
                                    Thread.currentThread().interrupt();
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
                        throw new RuntimeException("Job failed after " + maxRetries + " attempts: " 
                                + lastException.getMessage(), lastException);
                    }
                    
                    // This should never happen if lastException is properly tracked
                    throw new RuntimeException("Job failed but no exception was recorded");
                },
                timeout,
                queueable,
                resourceWeight);
    }

    /**
     * Creates deep copies of arguments when needed to avoid mutating the original objects
     * Particularly important for PDFFile objects that might be reused by Spring
     * 
     * @param originalArgs The original arguments
     * @param async Whether this is an async operation
     * @return A new array with safely processed arguments
     */
    private Object[] copyAndProcessArgs(Object[] originalArgs, boolean async) {
        if (originalArgs == null || originalArgs.length == 0) {
            return originalArgs;
        }
        
        Object[] processedArgs = new Object[originalArgs.length];
        
        // Copy all arguments
        for (int i = 0; i < originalArgs.length; i++) {
            Object arg = originalArgs[i];
            
            if (arg instanceof PDFFile pdfFile) {
                // Create a copy of PDFFile to avoid mutating the original
                PDFFile pdfFileCopy = new PDFFile();
                
                // Use Spring's BeanUtils to copy all properties, avoiding missed fields if PDFFile grows
                BeanUtils.copyProperties(pdfFile, pdfFileCopy);
                
                // Case 1: fileId is provided but no fileInput
                if (pdfFileCopy.getFileInput() == null && pdfFileCopy.getFileId() != null) {
                    try {
                        log.debug("Using fileId {} to get file content", pdfFileCopy.getFileId());
                        MultipartFile file = fileStorage.retrieveFile(pdfFileCopy.getFileId());
                        pdfFileCopy.setFileInput(file);
                    } catch (Exception e) {
                        throw new RuntimeException(
                                "Failed to resolve file by ID: " + pdfFileCopy.getFileId(), e);
                    }
                }
                // Case 2: For async requests, we need to make a copy of the MultipartFile
                else if (async && pdfFileCopy.getFileInput() != null) {
                    try {
                        log.debug("Making persistent copy of uploaded file for async processing");
                        MultipartFile originalFile = pdfFileCopy.getFileInput();
                        String fileId = fileStorage.storeFile(originalFile);

                        // Store the fileId for later reference
                        pdfFileCopy.setFileId(fileId);

                        // Replace the original MultipartFile with our persistent copy
                        MultipartFile persistentFile = fileStorage.retrieveFile(fileId);
                        pdfFileCopy.setFileInput(persistentFile);

                        log.debug("Created persistent file copy with fileId: {}", fileId);
                    } catch (IOException e) {
                        throw new RuntimeException(
                                "Failed to create persistent copy of uploaded file", e);
                    }
                }
                
                processedArgs[i] = pdfFileCopy;
            } else {
                // For non-PDFFile objects, just pass the original reference
                // If other classes need copy-on-write, add them here
                processedArgs[i] = arg;
            }
        }
        
        return processedArgs;
    }
    
    // Get the job ID from the context for progress tracking in TaskManager
    private String getJobIdFromContext() {
        try {
            return (String) request.getAttribute("jobId");
        } catch (Exception e) {
            log.debug("Could not retrieve job ID from context: {}", e.getMessage());
            return null;
        }
    }
}
