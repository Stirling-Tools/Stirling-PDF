package stirling.software.common.model.job;

import java.time.LocalDateTime;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Represents statistics about jobs in the system */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class JobStats {

    /** Total number of jobs (active and completed) */
    private int totalJobs;

    /** Number of active (incomplete) jobs */
    private int activeJobs;

    /** Number of completed jobs */
    private int completedJobs;

    /** Number of failed jobs */
    private int failedJobs;

    /** Number of successful jobs */
    private int successfulJobs;

    /** Number of jobs with file results */
    private int fileResultJobs;

    /** The oldest active job's creation timestamp */
    private LocalDateTime oldestActiveJobTime;

    /** The newest active job's creation timestamp */
    private LocalDateTime newestActiveJobTime;

    /** The average processing time for completed jobs in milliseconds */
    private long averageProcessingTimeMs;
}
