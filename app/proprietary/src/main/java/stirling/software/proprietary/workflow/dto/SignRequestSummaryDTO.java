package stirling.software.proprietary.workflow.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import stirling.software.proprietary.workflow.model.ParticipantStatus;

/** DTO for sign request summary (participant view) */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SignRequestSummaryDTO {
    private String sessionId;
    private String documentName;
    private String ownerUsername;
    private String createdAt;
    private String dueDate;
    private ParticipantStatus myStatus;
    private boolean finalized;

    @Schema(
            description =
                    "Whether the participant's access has expired; independent of the advisory due date")
    private boolean accessExpired;

    @Schema(
            description =
                    "Closed for this participant: inactive workflow, expired access, declined request or non-signing role. Submitted signatures stay active until the workflow closes.")
    private boolean closed;
}
