package stirling.software.SPDF.model.api.security;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import lombok.Data;

@Data
public class SigningParticipant {

    private String email;
    private String name;
    private ParticipantStatus status = ParticipantStatus.PENDING;
    private final List<String> notifications = new ArrayList<>();
    private final String shareToken = UUID.randomUUID().toString();
    private Instant lastUpdated = Instant.now();
    private ParticipantCertificateSubmission certificateSubmission;

    public void recordNotification(String message) {
        notifications.add(message);
        lastUpdated = Instant.now();
    }
}
