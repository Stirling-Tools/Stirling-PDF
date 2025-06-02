package stirling.software.common.aop;

import java.nio.file.Files;
import java.nio.file.Path;
import java.io.IOException;

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
        boolean async = Boolean.parseBoolean(request.getParameter("async"));

        // Inspect and possibly mutate arguments
        Object[] args = joinPoint.getArgs();
        boolean isAsyncRequest = async;

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
                else if (isAsyncRequest && pdfFile.getFileInput() != null) {
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
                        throw new RuntimeException("Failed to create persistent copy of uploaded file", e);
                    }
                }
            }
        }

        // Wrap job execution
        return jobExecutorService.runJobGeneric(
                async,
                () -> {
                    try {
                        return joinPoint.proceed(args);
                    } catch (Throwable ex) {
                        throw new RuntimeException(ex);
                    }
                });
    }
}
