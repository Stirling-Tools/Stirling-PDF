package stirling.software.common.service;

import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Supplier;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.controller.WebSocketProgressController;
import stirling.software.common.model.job.JobProgress;
import stirling.software.common.model.job.JobResponse;

/**
 * Service for executing jobs asynchronously or synchronously
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class JobExecutorService {

    private final TaskManager taskManager;
    private final WebSocketProgressController webSocketSender;
    private final FileStorage fileStorage;
    private final ExecutorService executor = Executors.newCachedThreadPool();

    /**
     * Run a job either asynchronously or synchronously
     * 
     * @param async Whether to run the job asynchronously
     * @param work The work to be done
     * @return The response
     */
    public ResponseEntity<?> runJobGeneric(boolean async, Supplier<Object> work) {
        String jobId = UUID.randomUUID().toString();
        log.debug("Running job with ID: {}, async: {}", jobId, async);

        if (async) {
            taskManager.createTask(jobId);
            webSocketSender.sendProgress(jobId, new JobProgress(jobId, "Started", 0, "Running"));

            executor.execute(
                    () -> {
                        try {
                            Object result = work.get();
                            processJobResult(jobId, result);
                            webSocketSender.sendProgress(
                                    jobId, new JobProgress(jobId, "Done", 100, "Complete"));
                        } catch (Exception e) {
                            log.error("Error executing job {}: {}", jobId, e.getMessage(), e);
                            taskManager.setError(jobId, e.getMessage());
                            webSocketSender.sendProgress(
                                    jobId, new JobProgress(jobId, "Error", 100, e.getMessage()));
                        }
                    });

            return ResponseEntity.ok().body(new JobResponse<>(true, jobId, null));
        } else {
            try {
                Object result = work.get();
                
                // If the result is already a ResponseEntity, return it directly
                if (result instanceof ResponseEntity) {
                    return (ResponseEntity<?>) result;
                }
                
                // Process different result types
                return handleResultForSyncJob(result);
            } catch (Exception e) {
                log.error("Error executing synchronous job: {}", e.getMessage(), e);
                return ResponseEntity.internalServerError().body("Job failed: " + e.getMessage());
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
                // Store byte array as a file
                String fileId = fileStorage.storeBytes((byte[]) result, "result.pdf");
                taskManager.setFileResult(jobId, fileId, "result.pdf", "application/pdf");
                log.debug("Stored byte[] result with fileId: {}", fileId);
            } else if (result instanceof ResponseEntity) {
                ResponseEntity<?> response = (ResponseEntity<?>) result;
                Object body = response.getBody();
                
                if (body instanceof byte[]) {
                    // Extract filename from content-disposition header if available
                    String filename = "result.pdf";
                    String contentType = "application/pdf";
                    
                    if (response.getHeaders().getContentDisposition() != null) {
                        String disposition = response.getHeaders().getContentDisposition().toString();
                        if (disposition.contains("filename=")) {
                            filename = disposition.substring(
                                    disposition.indexOf("filename=") + 9, 
                                    disposition.lastIndexOf("\""));
                        }
                    }
                    
                    if (response.getHeaders().getContentType() != null) {
                        contentType = response.getHeaders().getContentType().toString();
                    }
                    
                    String fileId = fileStorage.storeBytes((byte[]) body, filename);
                    taskManager.setFileResult(jobId, fileId, filename, contentType);
                    log.debug("Stored ResponseEntity<byte[]> result with fileId: {}", fileId);
                } else {
                    // Check if the response body contains a fileId
                    if (body != null && body.toString().contains("fileId")) {
                        try {
                            // Try to extract fileId using reflection
                            java.lang.reflect.Method getFileId = body.getClass().getMethod("getFileId");
                            String fileId = (String) getFileId.invoke(body);
                            
                            if (fileId != null && !fileId.isEmpty()) {
                                // Try to get filename and content type
                                String filename = "result.pdf";
                                String contentType = "application/pdf";
                                
                                try {
                                    java.lang.reflect.Method getOriginalFileName = body.getClass().getMethod("getOriginalFilename");
                                    String origName = (String) getOriginalFileName.invoke(body);
                                    if (origName != null && !origName.isEmpty()) {
                                        filename = origName;
                                    }
                                } catch (Exception e) {
                                    log.debug("Could not get original filename: {}", e.getMessage());
                                }
                                
                                try {
                                    java.lang.reflect.Method getContentType = body.getClass().getMethod("getContentType");
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
                            log.debug("Failed to extract fileId from response body: {}", e.getMessage());
                        }
                    }
                    
                    // Store generic result
                    taskManager.setResult(jobId, body);
                }
            } else if (result instanceof MultipartFile) {
                MultipartFile file = (MultipartFile) result;
                String fileId = fileStorage.storeFile(file);
                taskManager.setFileResult(
                        jobId, 
                        fileId, 
                        file.getOriginalFilename(), 
                        file.getContentType());
                log.debug("Stored MultipartFile result with fileId: {}", fileId);
            } else {
                // Check if result has a fileId field
                if (result != null) {
                    try {
                        // Try to extract fileId using reflection
                        java.lang.reflect.Method getFileId = result.getClass().getMethod("getFileId");
                        String fileId = (String) getFileId.invoke(result);
                        
                        if (fileId != null && !fileId.isEmpty()) {
                            // Try to get filename and content type
                            String filename = "result.pdf";
                            String contentType = "application/pdf";
                            
                            try {
                                java.lang.reflect.Method getOriginalFileName = result.getClass().getMethod("getOriginalFilename");
                                String origName = (String) getOriginalFileName.invoke(result);
                                if (origName != null && !origName.isEmpty()) {
                                    filename = origName;
                                }
                            } catch (Exception e) {
                                log.debug("Could not get original filename: {}", e.getMessage());
                            }
                            
                            try {
                                java.lang.reflect.Method getContentType = result.getClass().getMethod("getContentType");
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
                        log.debug("Failed to extract fileId from result object: {}", e.getMessage());
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
                    .header(HttpHeaders.CONTENT_DISPOSITION, 
                            "form-data; name=\"attachment\"; filename=\"result.pdf\"")
                    .body(result);
        } else if (result instanceof MultipartFile) {
            // Return MultipartFile content
            MultipartFile file = (MultipartFile) result;
            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType(file.getContentType()))
                    .header(HttpHeaders.CONTENT_DISPOSITION, 
                            "form-data; name=\"attachment\"; filename=\"" + 
                                    file.getOriginalFilename() + "\"")
                    .body(file.getBytes());
        } else {
            // Default case: return as JSON
            return ResponseEntity.ok(result);
        }
    }
}
