package stirling.software.proprietary.workflow.model;

/**
 * Defines the overall status of a workflow session. Tracks the lifecycle from creation through
 * completion or cancellation.
 */
public enum WorkflowStatus {
    /** Workflow is active and awaiting participant actions */
    IN_PROGRESS,

    /** Workflow has been successfully completed by all participants */
    COMPLETED,

    /** Workflow has been cancelled by the owner or system */
    CANCELLED
}
