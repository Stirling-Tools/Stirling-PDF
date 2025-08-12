package stirling.software.proprietary.model;

import java.io.Serializable;
import java.time.Instant;
import java.time.YearMonth;
import java.util.HashSet;
import java.util.Set;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import lombok.*;

import stirling.software.proprietary.model.converter.YearMonthStringConverter;

@Entity
@Table(name = "anonymous_api_usage",
    uniqueConstraints = {
        @UniqueConstraint(name = "uq_anon_fingerprint_month", columnNames = {"fingerprint", "month"})
    },
    indexes = {
        @Index(name = "idx_anon_fingerprint", columnList = "fingerprint"),
        @Index(name = "idx_anon_month", columnList = "month"),
        @Index(name = "idx_anon_ip", columnList = "ip_address")
    })
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Getter
@Setter
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@ToString(onlyExplicitlyIncluded = true)
public class AnonymousApiUsage implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    @EqualsAndHashCode.Include
    @ToString.Include
    private Long id;

    @NotNull
    @Column(name = "fingerprint", nullable = false, length = 128)
    @ToString.Include
    private String fingerprint;

    @NotNull
    @Column(name = "month", nullable = false, length = 7)
    @Convert(converter = YearMonthStringConverter.class)
    private YearMonth month;

    @NotNull
    @Column(name = "usage_count", nullable = false)
    @Builder.Default
    private Integer usageCount = 0;

    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    @Column(name = "user_agent", length = 512)
    private String userAgent;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(
        name = "anonymous_api_related_fingerprints",
        joinColumns = @JoinColumn(name = "usage_id")
    )
    @Column(name = "related_fingerprint")
    @Builder.Default
    private Set<String> relatedFingerprints = new HashSet<>();

    @Column(name = "abuse_score")
    @Builder.Default
    private Integer abuseScore = 0;

    @Column(name = "is_blocked")
    @Builder.Default
    private Boolean isBlocked = false;

    @Column(name = "last_access")
    private Instant lastAccess;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false, nullable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version")
    private Long version;

    @PreUpdate
    public void preUpdate() {
        this.lastAccess = Instant.now();
    }
}