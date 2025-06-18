package stirling.software.common.aop;

import java.io.IOException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

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

        // Inspect and possibly mutate arguments
        Object[] args = joinPoint.getArgs();

        for (int i = 0; i < args.length; i++) {
            Object arg = args[i];

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

        // Extract queueable and resourceWeight parameters
        boolean queueable = autoJobPostMapping.queueable();
        int resourceWeight = autoJobPostMapping.resourceWeight();

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

        AtomicInteger attempts = new AtomicInteger(0);
        // Keep jobId reference for progress tracking in TaskManager
        AtomicReference<String> jobIdRef = new AtomicReference<>();

        return jobExecutorService.runJobGeneric(
                async,
                () -> {
                    int currentAttempt = attempts.incrementAndGet();
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

                        return joinPoint.proceed(args);
                    } catch (Throwable ex) {
                        log.error(
                                "AutoJobAspect caught exception during job execution (attempt {}/{}): {}",
                                currentAttempt,
                                Math.max(1, maxRetries),
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

                            try {
                                // Simple exponential backoff
                                Thread.sleep(100 * currentAttempt);
                            } catch (InterruptedException ie) {
                                Thread.currentThread().interrupt();
                            }

                            // Recursive call to retry
                            return executeWithRetries(
                                    joinPoint,
                                    args,
                                    async,
                                    timeout,
                                    maxRetries,
                                    trackProgress,
                                    queueable,
                                    resourceWeight);
                        }

                        // No more retries, throw the exception
                        throw new RuntimeException("Job failed: " + ex.getMessage(), ex);
                    }
                },
                timeout,
                queueable,
                resourceWeight);
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
