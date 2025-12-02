package stirling.software.proprietary.model;

import java.io.Serializable;
import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.*;

import lombok.*;

@Entity
@Table(name = "participant_certificate_submissions")
@NoArgsConstructor
@Getter
@Setter
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@ToString(onlyExplicitlyIncluded = true)
public class ParticipantCertificateSubmissionEntity implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    @EqualsAndHashCode.Include
    @ToString.Include
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "participant_id", nullable = false, unique = true)
    @JsonIgnore
    private SigningParticipantEntity participant;

    @Column(name = "cert_type", nullable = false)
    private String certType;

    @Column(name = "password")
    private String password;

    @Lob
    @Column(name = "private_key", columnDefinition = "bytea")
    private byte[] privateKey;

    @Lob
    @Column(name = "certificate", columnDefinition = "bytea")
    private byte[] certificate;

    @Lob
    @Column(name = "p12_keystore", columnDefinition = "bytea")
    private byte[] p12Keystore;

    @Lob
    @Column(name = "jks_keystore", columnDefinition = "bytea")
    private byte[] jksKeystore;

    @Column(name = "show_signature")
    private Boolean showSignature;

    @Column(name = "page_number")
    private Integer pageNumber;

    @Column(name = "name")
    private String name;

    @Column(name = "reason")
    private String reason;

    @Column(name = "location")
    private String location;

    @Column(name = "show_logo")
    private Boolean showLogo;

    @CreationTimestamp
    @Column(name = "submitted_at", updatable = false)
    private LocalDateTime submittedAt;
}
