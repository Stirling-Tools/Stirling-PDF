package stirling.software.SPDF.model;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

/**
 * Represents an asynchronous pipeline processing job submitted via the jobs API.
 *
 * <p>Thread-safety: {@code status} is volatile. All result fields are written before {@code status}
 * is set to {@code COMPLETED} or {@code FAILED}, so any thread that observes the terminal status is
 * guaranteed (by the Java Memory Model volatile write/read ordering) to see the result fields.
 *
 * <p>Results are stored as a temp file on disk rather than in the JVM heap, preventing large
 * PDFs from causing memory pressure when many jobs are in flight simultaneously.
 */
@Getter
@Slf4j
public class PipelineJob {

    public enum Status {
        PENDING,
        PROCESSING,
        COMPLETED,
        FAILED
    }

    private final String id;

    /** Client sessionId (localStorage UUID) — used to route SSE push notifications. */
    private final String sessionId;

    private final long createdAt = System.currentTimeMillis();

    private volatile Status status = Status.PENDING;

    private String resultFilename;
    /** Temp file holding the result bytes; deleted when the job is cleaned up. */
    private Path resultPath;

    private String errorMessage;

    public PipelineJob(String id, String sessionId) {
        this.id = id;
        this.sessionId = sessionId;
    }

    /** Write result fields first, then flip status — preserves volatile visibility guarantee. */
    public void complete(String filename, Path path) {
        this.resultFilename = filename;
        this.resultPath = path;
        this.status = Status.COMPLETED;
    }

    public void fail(String error) {
        this.errorMessage = error;
        this.status = Status.FAILED;
    }

    public void markProcessing() {
        this.status = Status.PROCESSING;
    }

    /** Delete the result temp file if it exists. Called during job cleanup. */
    public void deleteResultFile() {
        if (resultPath != null) {
            try {
                Files.deleteIfExists(resultPath);
            } catch (IOException e) {
                log.warn("Could not delete result temp file {}: {}", resultPath, e.getMessage());
            }
        }
    }
}
