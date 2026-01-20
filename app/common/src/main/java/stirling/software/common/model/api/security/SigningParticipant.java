package stirling.software.common.model.api.security;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import lombok.Data;

@Data
public class SigningParticipant {

    private Long userId; // Database user ID (null for in-memory sessions)
    private String email;
    private String name;
    private ParticipantStatus status = ParticipantStatus.PENDING;
    private List<String> notifications = new ArrayList<>();
    private String shareToken = UUID.randomUUID().toString();
    private String lastUpdated = Instant.now().toString();
    private ParticipantCertificateSubmission certificateSubmission;

    public void recordNotification(String message) {
        notifications.add(message);
        lastUpdated = Instant.now().toString();
    }
}
