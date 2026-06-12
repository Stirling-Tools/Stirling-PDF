package stirling.software.proprietary.workflow.dto;

import java.util.List;

import org.jboss.resteasy.reactive.RestForm;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import stirling.software.proprietary.workflow.model.WorkflowType;

/**
 * Request DTO for creating a new workflow session. Used to initialize workflow sessions with
 * participants and settings.
 */
// MIGRATION: bound via @MultipartForm on a multipart @POST
// (SigningSessionController.createSession).
// RESTEasy Reactive populates multipart POJOs from @RestForm-annotated FIELDS only (Spring's
// @ModelAttribute bound by property name); without them augmentation fails with "No annotations
// found on fields ...". All fields here are simple/collection types RESTEasy can convert.
@Data
@NoArgsConstructor
@AllArgsConstructor
public class WorkflowCreationRequest {

    /** Type of workflow to create (SIGNING, REVIEW, APPROVAL) */
    @RestForm("workflowType")
    private WorkflowType workflowType;

    /** Display name for the document in the workflow */
    @RestForm("documentName")
    private String documentName;

    /** Owner's email address (optional, used for notifications) */
    @RestForm("ownerEmail")
    private String ownerEmail;

    /** Message/instructions for participants */
    @RestForm("message")
    private String message;

    /** Due date for workflow completion (flexible string format) */
    @RestForm("dueDate")
    private String dueDate;

    /** List of participant user IDs (for registered users) */
    @RestForm("participantUserIds")
    private List<Long> participantUserIds;

    /** List of participant email addresses (for external/unregistered users) */
    @RestForm("participantEmails")
    private List<String> participantEmails;

    /** Workflow-specific metadata (JSON string) */
    @RestForm("workflowMetadata")
    private String workflowMetadata;
}
