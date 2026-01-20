package stirling.software.proprietary.model;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import org.hibernate.annotations.UpdateTimestamp;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.*;

import lombok.*;

import stirling.software.common.model.api.security.ParticipantStatus;
import stirling.software.proprietary.security.model.User;

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

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = true)
    @JsonIgnore
    private User user;

    @Column(name = "email")
    private String email;

    @Column(name = "name")
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private ParticipantStatus status = ParticipantStatus.PENDING;

    @Column(name = "share_token", unique = true, length = 36)
    @EqualsAndHashCode.Include
    private String shareToken;

    // Signature appearance settings (owner-controlled)
    @Column(name = "show_signature")
    private Boolean showSignature;

    @Column(name = "page_number")
    private Integer pageNumber;

    @Column(name = "reason")
    private String reason;

    @Column(name = "location")
    private String location;

    @Column(name = "show_logo")
    private Boolean showLogo;

    // Wet signature metadata (visual signature placed by participant)
    // This data is private to the participant and cleared after finalization
    @Column(name = "wet_signature_type", length = 20)
    private String wetSignatureType; // "canvas" | "image" | "text"

    @Lob
    @Column(name = "wet_signature_data", columnDefinition = "TEXT")
    private String wetSignatureData; // Base64 image data or text

    @Column(name = "wet_signature_page")
    private Integer wetSignaturePage;

    @Column(name = "wet_signature_x")
    private Double wetSignatureX;

    @Column(name = "wet_signature_y")
    private Double wetSignatureY;

    @Column(name = "wet_signature_width")
    private Double wetSignatureWidth;

    @Column(name = "wet_signature_height")
    private Double wetSignatureHeight;

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
