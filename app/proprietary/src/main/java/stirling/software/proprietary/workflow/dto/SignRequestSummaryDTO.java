package stirling.software.proprietary.workflow.dto;

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
}
