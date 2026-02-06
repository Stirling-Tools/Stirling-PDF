package stirling.software.proprietary.workflow.dto;

import java.time.LocalDateTime;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import stirling.software.proprietary.storage.model.ShareAccessRole;
import stirling.software.proprietary.workflow.model.ParticipantStatus;

/**
 * Response DTO for workflow participant details. Used in API responses to provide participant
 * information.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ParticipantResponse {

    private Long id;
    private Long userId;
    private String email;
    private String name;
    private ParticipantStatus status;
    private String shareToken;
    private ShareAccessRole accessRole;
    private LocalDateTime expiresAt;
    private LocalDateTime lastUpdated;
    private boolean hasCompleted;
    private boolean isExpired;
}
