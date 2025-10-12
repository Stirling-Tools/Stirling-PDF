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

    /** Whether detailed progress tracking is enabled for this job. */
    @Builder.Default private boolean trackProgress = true;

    /** Most recent percentage update (0-100) if progress tracking is enabled. */
    private Integer progressPercent;

    /** Human readable progress message (e.g. current stage) when progress is enabled. */
    private String progressMessage;

    /** Timestamp of the last progress update. */
    private LocalDateTime progressUpdatedAt;

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
        return createNew(jobId, true);
    }

    /**
     * Create a new JobResult with the given job ID and progress tracking preference.
     *
     * @param jobId The job ID
     * @param trackProgress Whether detailed progress should be tracked
     * @return A new JobResult
     */
    public static JobResult createNew(String jobId, boolean trackProgress) {
        JobResult result =
                JobResult.builder()
                        .jobId(jobId)
                        .complete(false)
                        .createdAt(LocalDateTime.now())
                        .trackProgress(trackProgress)
                        .build();
        if (trackProgress) {
            result.updateProgressInternal(0, "Pending");
        }
        return result;
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
        if (trackProgress) {
            updateProgressInternal(100, "Completed");
        }
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
        if (trackProgress) {
            updateProgressInternal(100, error != null ? error : "Failed");
        }
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
        if (trackProgress) {
            updateProgressInternal(100, "Completed");
        }
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

    /**
     * Update the progress information if tracking is enabled.
     *
     * @param percent The percent complete (0-100)
     * @param message Optional descriptive message
     */
    public void updateProgress(int percent, String message) {
        if (!trackProgress) {
            return;
        }
        updateProgressInternal(percent, message);
    }

    private void updateProgressInternal(int percent, String message) {
        int clamped = Math.min(100, Math.max(0, percent));
        this.progressPercent = clamped;
        if (message != null && !message.isBlank()) {
            this.progressMessage = message;
        }
        this.progressUpdatedAt = LocalDateTime.now();
    }
}
