package stirling.software.proprietary.workflow.model;

/**
 * Defines the type of workflow being executed. Determines the business logic and lifecycle for the
 * workflow session.
 */
public enum WorkflowType {
    /** Document signing workflow - participants sign a PDF with digital certificates */
    SIGNING,

    /** Document review workflow - participants review and comment on a document */
    REVIEW,

    /** Document approval workflow - participants approve or reject a document */
    APPROVAL
}
