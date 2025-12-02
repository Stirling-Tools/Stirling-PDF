package stirling.software.proprietary.model;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.*;

import lombok.*;

import stirling.software.proprietary.security.model.User;

@Entity
@Table(name = "signing_sessions")
@NoArgsConstructor
@Getter
@Setter
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@ToString(onlyExplicitlyIncluded = true)
public class SigningSessionEntity implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    @EqualsAndHashCode.Include
    @ToString.Include
    private Long id;

    @Column(name = "session_id", unique = true, nullable = false, length = 36)
    @EqualsAndHashCode.Include
    @ToString.Include
    private String sessionId = UUID.randomUUID().toString();

    @Column(name = "document_name", nullable = false)
    private String documentName;

    @Lob
    @Basic(fetch = FetchType.EAGER)
    @Column(name = "original_pdf", nullable = false, columnDefinition = "bytea")
    @JsonIgnore
    private byte[] originalPdf;

    @Lob
    @Basic(fetch = FetchType.EAGER)
    @Column(name = "signed_pdf", columnDefinition = "bytea")
    @JsonIgnore
    private byte[] signedPdf;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    @JsonIgnore
    private User user;

    @Column(name = "owner_email")
    private String ownerEmail;

    @Column(name = "message", columnDefinition = "text")
    private String message;

    @Column(name = "due_date")
    private String dueDate;

    @Column(name = "is_finalized", nullable = false)
    private boolean finalized = false;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @OneToMany(
            mappedBy = "session",
            cascade = CascadeType.ALL,
            orphanRemoval = true,
            fetch = FetchType.LAZY)
    @JsonIgnore
    private List<SigningParticipantEntity> participants = new ArrayList<>();

    public void addParticipant(SigningParticipantEntity participant) {
        participants.add(participant);
        participant.setSession(this);
    }

    public void removeParticipant(SigningParticipantEntity participant) {
        participants.remove(participant);
        participant.setSession(null);
    }

    public void touch() {
        this.updatedAt = LocalDateTime.now();
    }
}
