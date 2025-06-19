package stirling.software.common.model.job;

import java.time.LocalDateTime;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.List;
import java.util.Collections;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Represents the result of a job execution. Used by the TaskManager to store job results. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class JobResult {

    /** The job ID */
    private String jobId;

    /** Flag indicating if the job is complete */
    private boolean complete;

    /** Error message if the job failed */
    private String error;

    /** The file ID of the result file, if applicable */
    private String fileId;

    /** Original file name, if applicable */
    private String originalFileName;

    /** MIME type of the result, if applicable */
    private String contentType;

    /** Time when the job was created */
    private LocalDateTime createdAt;

    /** Time when the job was completed */
    private LocalDateTime completedAt;

    /** The actual result object, if not a file */
    private Object result;
    
    /** 
     * Notes attached to this job for tracking purposes. 
     * Uses CopyOnWriteArrayList for thread safety when notes are added concurrently.
     */
    private final List<String> notes = new CopyOnWriteArrayList<>();

    /**
     * Create a new JobResult with the given job ID
     *
     * @param jobId The job ID
     * @return A new JobResult
     */
    public static JobResult createNew(String jobId) {
        return JobResult.builder()
                .jobId(jobId)
                .complete(false)
                .createdAt(LocalDateTime.now())
                .build();
    }

    /**
     * Mark this job as complete with a file result
     *
     * @param fileId The file ID of the result
     * @param originalFileName The original file name
     * @param contentType The content type of the file
     */
    public void completeWithFile(String fileId, String originalFileName, String contentType) {
        this.complete = true;
        this.fileId = fileId;
        this.originalFileName = originalFileName;
        this.contentType = contentType;
        this.completedAt = LocalDateTime.now();
    }

    /**
     * Mark this job as complete with a general result
     *
     * @param result The result object
     */
    public void completeWithResult(Object result) {
        this.complete = true;
        this.result = result;
        this.completedAt = LocalDateTime.now();
    }

    /**
     * Mark this job as failed with an error message
     *
     * @param error The error message
     */
    public void failWithError(String error) {
        this.complete = true;
        this.error = error;
        this.completedAt = LocalDateTime.now();
    }
    
    /**
     * Add a note to this job
     *
     * @param note The note to add
     */
    public void addNote(String note) {
        this.notes.add(note);
    }
    
    /**
     * Get all notes attached to this job
     *
     * @return An unmodifiable view of the notes list
     */
    public List<String> getNotes() {
        return Collections.unmodifiableList(notes);
    }
}
