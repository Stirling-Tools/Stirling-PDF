package stirling.software.common.service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.job.JobResult;

/**
 * Manages async tasks and their results
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TaskManager {
    private final Map<String, JobResult> jobResults = new ConcurrentHashMap<>();
    
    @Value("${stirling.jobResultExpiryMinutes:30}")
    private int jobResultExpiryMinutes = 30;
    
    private final FileStorage fileStorage;
    
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
    public void setFileResult(String jobId, String fileId, String originalFileName, String contentType) {
        JobResult jobResult = getOrCreateJobResult(jobId);
        jobResult.completeWithFile(fileId, originalFileName, contentType);
        log.debug("Set file result for job ID: {} with file ID: {}", jobId, fileId);
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
        if (jobResult.getResult() == null && jobResult.getFileId() == null && jobResult.getError() == null) {
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
     * Get or create a job result
     * 
     * @param jobId The job ID
     * @return The job result
     */
    private JobResult getOrCreateJobResult(String jobId) {
        return jobResults.computeIfAbsent(jobId, JobResult::createNew);
    }
    
    /**
     * REST controller for job-related endpoints
     */
    @RestController
    public class JobController {
        
        /**
         * Get the status of a job
         * 
         * @param jobId The job ID
         * @return The job result
         */
        @GetMapping("/api/v1/general/job/{jobId}")
        public ResponseEntity<?> getJobStatus(@PathVariable("jobId") String jobId) {
            JobResult result = jobResults.get(jobId);
            if (result == null) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.ok(result);
        }
        
        /**
         * Get the result of a job
         * 
         * @param jobId The job ID
         * @return The job result
         */
        @GetMapping("/api/v1/general/job/{jobId}/result")
        public ResponseEntity<?> getJobResult(@PathVariable("jobId") String jobId) {
            JobResult result = jobResults.get(jobId);
            if (result == null) {
                return ResponseEntity.notFound().build();
            }
            
            if (!result.isComplete()) {
                return ResponseEntity.badRequest().body("Job is not complete yet");
            }
            
            if (result.getError() != null) {
                return ResponseEntity.badRequest().body("Job failed: " + result.getError());
            }
            
            if (result.getFileId() != null) {
                try {
                    byte[] fileContent = fileStorage.retrieveBytes(result.getFileId());
                    return ResponseEntity.ok()
                            .header("Content-Type", result.getContentType())
                            .header("Content-Disposition", 
                                    "form-data; name=\"attachment\"; filename=\"" + 
                                    result.getOriginalFileName() + "\"")
                            .body(fileContent);
                } catch (Exception e) {
                    log.error("Error retrieving file for job {}: {}", jobId, e.getMessage(), e);
                    return ResponseEntity.internalServerError()
                            .body("Error retrieving file: " + e.getMessage());
                }
            }
            
            return ResponseEntity.ok(result.getResult());
        }
    }
}
