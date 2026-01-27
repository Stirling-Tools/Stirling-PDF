package stirling.software.proprietary.workflow.dto;

import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import stirling.software.proprietary.workflow.model.WorkflowType;

/**
 * Request DTO for creating a new workflow session. Used to initialize workflow sessions with
 * participants and settings.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class WorkflowCreationRequest {

    /** Type of workflow to create (SIGNING, REVIEW, APPROVAL) */
    private WorkflowType workflowType;

    /** Display name for the document in the workflow */
    private String documentName;

    /** Owner's email address (optional, used for notifications) */
    private String ownerEmail;

    /** Message/instructions for participants */
    private String message;

    /** Due date for workflow completion (flexible string format) */
    private String dueDate;

    /** List of participant user IDs (for registered users) */
    private List<Long> participantUserIds;

    /** List of participant email addresses (for external/unregistered users) */
    private List<String> participantEmails;

    /** List of detailed participant configurations */
    private List<ParticipantRequest> participants;

    /** Workflow-specific metadata (JSON string) */
    private String workflowMetadata;
}
