package stirling.software.SPDF.utils;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import lombok.Getter;
import lombok.Setter;

/**
 * Represents a task being processed by the ProcessExecutor. Used for tracking queue position and
 * execution status.
 */
@Getter
public class ConversionTask {
    public enum TaskStatus {
        QUEUED,
        RUNNING,
        COMPLETED,
        FAILED,
        CANCELLED
    }

    private final String id;
    private final String taskName;
    private final Instant createdTime;
    private final ProcessExecutor.Processes processType;

    @Setter private volatile int queuePosition;

    private volatile Instant startTime;
    private volatile Instant endTime;
    private volatile TaskStatus status;
    private volatile String errorMessage;
    private volatile Thread executingThread;

    /**
     * Creates a new conversion task
     *
     * @param taskName A descriptive name for the task
     * @param processType The type of process executing the task
     */
    public ConversionTask(String taskName, ProcessExecutor.Processes processType) {
        this.id = UUID.randomUUID().toString();
        this.taskName = taskName;
        this.processType = processType;
        this.createdTime = Instant.now();
        this.status = TaskStatus.QUEUED;
    }

    /**
     * Creates a new conversion task with a custom ID
     *
     * @param taskName A descriptive name for the task
     * @param customId A custom ID for the task (can be null to generate a random UUID)
     */
    public ConversionTask(String taskName, String customId) {
        this.id = (customId != null) ? customId : UUID.randomUUID().toString();
        this.taskName = taskName;
        this.processType = null; // No process type for custom tasks
        this.createdTime = Instant.now();
        this.status = TaskStatus.QUEUED;
    }

    /** Marks the task as running */
    public void start(Thread executingThread) {
        this.startTime = Instant.now();
        this.status = TaskStatus.RUNNING;
        this.executingThread = executingThread;
    }

    /** Marks the task as completed */
    public void complete() {
        this.endTime = Instant.now();
        this.status = TaskStatus.COMPLETED;
        this.executingThread = null;
    }

    /**
     * Marks the task as failed
     *
     * @param errorMessage The error message
     */
    public void fail(String errorMessage) {
        this.endTime = Instant.now();
        this.status = TaskStatus.FAILED;
        this.errorMessage = errorMessage;
        this.executingThread = null;
    }

    /** Marks the task as cancelled */
    public void cancel() {
        this.endTime = Instant.now();
        this.status = TaskStatus.CANCELLED;
        this.executingThread = null;
    }

    /** Attempts to cancel the task if it's running */
    public void attemptCancel() {
        if (this.status == TaskStatus.RUNNING && executingThread != null) {
            executingThread.interrupt();
        } else {
            cancel();
        }
    }

    /**
     * Gets the time spent in queue
     *
     * @return Queue time in milliseconds
     */
    public long getQueueTimeMs() {
        if (startTime == null) {
            return Duration.between(createdTime, Instant.now()).toMillis();
        }
        return Duration.between(createdTime, startTime).toMillis();
    }

    /**
     * Gets the processing time
     *
     * @return Processing time in milliseconds
     */
    public long getProcessingTimeMs() {
        if (startTime == null) {
            return 0;
        }
        if (endTime == null) {
            return Duration.between(startTime, Instant.now()).toMillis();
        }
        return Duration.between(startTime, endTime).toMillis();
    }

    /**
     * Gets the total time from task creation to completion or now
     *
     * @return Total time in milliseconds
     */
    public long getTotalTimeMs() {
        if (endTime == null) {
            return Duration.between(createdTime, Instant.now()).toMillis();
        }
        return Duration.between(createdTime, endTime).toMillis();
    }

    /**
     * Gets a formatted string of queue time
     *
     * @return Formatted time
     */
    public String getFormattedQueueTime() {
        return formatDuration(getQueueTimeMs());
    }

    /**
     * Gets a formatted string of processing time
     *
     * @return Formatted time
     */
    public String getFormattedProcessingTime() {
        return formatDuration(getProcessingTimeMs());
    }

    /**
     * Gets a formatted string of total time
     *
     * @return Formatted time
     */
    public String getFormattedTotalTime() {
        return formatDuration(getTotalTimeMs());
    }

    /**
     * Formats milliseconds as a readable duration
     *
     * @param ms Milliseconds
     * @return Formatted string
     */
    private String formatDuration(long ms) {
        if (ms < 1000) {
            return ms + "ms";
        }
        if (ms < 60000) {
            return String.format("%.1fs", ms / 1000.0);
        }
        return String.format("%dm %ds", ms / 60000, (ms % 60000) / 1000);
    }
}
