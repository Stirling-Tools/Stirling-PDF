package stirling.software.proprietary.workflow.dto;

import java.time.LocalDateTime;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import stirling.software.proprietary.storage.model.ShareAccessRole;

/**
 * Request DTO for adding or configuring a workflow participant. Supports both registered users and
 * external email participants.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ParticipantRequest {

    /** User ID if participant is a registered user */
    private Long userId;

    /** Email address (required for external users, optional for registered users) */
    private String email;

    /** Display name for the participant */
    private String name;

    /** Access role for the participant (EDITOR, COMMENTER, VIEWER) */
    private ShareAccessRole accessRole;

    /** Optional expiration timestamp for participant access */
    private LocalDateTime expiresAt;

    /** Participant-specific metadata (JSON string) */
    private String participantMetadata;

    /** Whether to send notification immediately */
    private boolean sendNotification = true;
}
