package stirling.software.saas.payg.model;

/**
 * Shape of the workflow the job represents. Recorded for analytics; per-process step limits live on
 * {@link JobSource} now.
 */
public enum ProcessType {
    SINGLE_TOOL,
    CHAIN,
    AUTOMATION
}
