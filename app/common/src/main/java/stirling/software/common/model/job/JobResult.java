package stirling.software.common.model.job;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import com.fasterxml.jackson.annotation.JsonIgnore;

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

    /** List of result files for jobs that produce files */
    @JsonIgnore private List<ResultFile> resultFiles;

    /** Time when the job was created */
    private LocalDateTime createdAt;

    /** Time when the job was completed */
    private LocalDateTime completedAt;

    /** The actual result object, if not a file */
    private Object result;

    /**
     * Notes attached to this job for tracking purposes. Uses CopyOnWriteArrayList for thread safety
     * when notes are added concurrently.
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
     * Mark this job as complete with multiple file results
     *
     * @param resultFiles The list of result files
     */
    public void completeWithFiles(List<ResultFile> resultFiles) {
        this.complete = true;
        this.resultFiles = new ArrayList<>(resultFiles);
        this.completedAt = LocalDateTime.now();
    }

    /**
     * Mark this job as complete with a single file result (convenience method)
     *
     * @param fileId The file ID of the result
     * @param fileName The file name
     * @param contentType The content type of the file
     * @param fileSize The size of the file in bytes
     */
    public void completeWithSingleFile(
            String fileId, String fileName, String contentType, long fileSize) {
        ResultFile resultFile =
                ResultFile.builder()
                        .fileId(fileId)
                        .fileName(fileName)
                        .contentType(contentType)
                        .fileSize(fileSize)
                        .build();
        completeWithFiles(List.of(resultFile));
    }

    /**
     * Check if this job has file results
     *
     * @return true if this job has file results, false otherwise
     */
    public boolean hasFiles() {
        return resultFiles != null && !resultFiles.isEmpty();
    }

    /**
     * Check if this job has multiple file results
     *
     * @return true if this job has multiple file results, false otherwise
     */
    public boolean hasMultipleFiles() {
        return resultFiles != null && resultFiles.size() > 1;
    }

    /**
     * Get all result files
     *
     * @return List of result files
     */
    public List<ResultFile> getAllResultFiles() {
        if (resultFiles != null && !resultFiles.isEmpty()) {
            return Collections.unmodifiableList(resultFiles);
        }
        return Collections.emptyList();
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
