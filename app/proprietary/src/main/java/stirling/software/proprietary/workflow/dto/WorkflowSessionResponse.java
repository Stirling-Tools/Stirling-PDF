package stirling.software.proprietary.workflow.dto;

import java.time.LocalDateTime;
import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import stirling.software.proprietary.workflow.model.WorkflowStatus;
import stirling.software.proprietary.workflow.model.WorkflowType;

/**
 * Response DTO for workflow session details. Used in API responses to provide session information
 * to clients.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class WorkflowSessionResponse {

    private String sessionId;
    private Long ownerId;
    private String ownerUsername;
    private WorkflowType workflowType;
    private String documentName;
    private String ownerEmail;
    private String message;
    private String dueDate;
    private WorkflowStatus status;
    private boolean finalized;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private List<ParticipantResponse> participants;
    private int participantCount;
    private int signedCount;
    private boolean hasProcessedFile;
    private Long originalFileId;
    private Long processedFileId;
}
