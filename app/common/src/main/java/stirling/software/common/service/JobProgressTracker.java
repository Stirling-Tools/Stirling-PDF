package stirling.software.common.service;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;

/**
 * Utility that helps controllers report progress in a structured way by distributing the 0-100%
 * range across a finite number of logical steps.
 */
@RequiredArgsConstructor(access = AccessLevel.PACKAGE)
public class JobProgressTracker {

    private final TaskManager taskManager;
    private final String jobId;
    private final int totalSteps;
    private final boolean enabled;

    private int completedSteps;

    static JobProgressTracker disabled() {
        return new JobProgressTracker(null, null, 1, false);
    }

    /** Whether the tracker will emit updates. */
    public boolean isEnabled() {
        return enabled;
    }

    /** Advance the tracker by one step. */
    public void advance() {
        advanceBy(1, null);
    }

    /** Advance the tracker by {@code steps} steps. */
    public void advanceBy(int steps, String message) {
        if (!enabled) {
            return;
        }
        int safeSteps = Math.max(0, steps);
        completedSteps = Math.min(totalSteps, completedSteps + safeSteps);
        publish(message);
    }

    /** Advance the tracker by {@code steps} steps without a message. */
    public void advanceBy(int steps) {
        advanceBy(steps, null);
    }

    /** Explicitly set the completed steps count. */
    public void setStepsCompleted(int stepsCompleted, String message) {
        if (!enabled) {
            return;
        }
        completedSteps = Math.max(0, Math.min(totalSteps, stepsCompleted));
        publish(message);
    }

    /** Explicitly set completed steps without a message. */
    public void setStepsCompleted(int stepsCompleted) {
        setStepsCompleted(stepsCompleted, null);
    }

    /** Mark the tracker as complete and emit a final message. */
    public void complete(String message) {
        if (!enabled) {
            return;
        }
        completedSteps = totalSteps;
        taskManager.updateProgress(jobId, 100, message);
    }

    /** Mark the tracker as complete without a message. */
    public void complete() {
        complete(null);
    }

    private void publish(String message) {
        int percent = (int) Math.floor(((double) completedSteps / (double) totalSteps) * 100);
        taskManager.updateProgress(jobId, percent, message);
    }
}
