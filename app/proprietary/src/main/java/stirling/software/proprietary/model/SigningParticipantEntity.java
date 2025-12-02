package stirling.software.proprietary.model;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.hibernate.annotations.UpdateTimestamp;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.*;

import lombok.*;

import stirling.software.common.model.api.security.ParticipantStatus;

@Entity
@Table(name = "signing_participants")
@NoArgsConstructor
@Getter
@Setter
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@ToString(onlyExplicitlyIncluded = true)
public class SigningParticipantEntity implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    @EqualsAndHashCode.Include
    @ToString.Include
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", nullable = false)
    @JsonIgnore
    private SigningSessionEntity session;

    @Column(name = "email", nullable = false)
    private String email;

    @Column(name = "name")
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private ParticipantStatus status = ParticipantStatus.PENDING;

    @Column(name = "share_token", unique = true, nullable = false, length = 36)
    @EqualsAndHashCode.Include
    private String shareToken = UUID.randomUUID().toString();

    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(
            name = "participant_notifications",
            joinColumns = @JoinColumn(name = "participant_id"))
    @Column(name = "notification_message", columnDefinition = "text")
    private List<String> notifications = new ArrayList<>();

    @UpdateTimestamp
    @Column(name = "last_updated")
    private LocalDateTime lastUpdated;

    @OneToOne(
            mappedBy = "participant",
            cascade = CascadeType.ALL,
            orphanRemoval = true,
            fetch = FetchType.LAZY)
    @JsonIgnore
    private ParticipantCertificateSubmissionEntity certificateSubmission;

    public void recordNotification(String message) {
        notifications.add(message);
        lastUpdated = LocalDateTime.now();
    }
}
