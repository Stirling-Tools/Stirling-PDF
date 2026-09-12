package stirling.software.saas.model;

import java.io.Serializable;
import java.time.LocalDateTime;

import org.hibernate.annotations.Cache;
import org.hibernate.annotations.CacheConcurrencyStrategy;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;
import org.hibernate.annotations.UpdateTimestamp;
import org.springframework.data.domain.Persistable;

import jakarta.persistence.Cacheable;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import stirling.software.proprietary.security.model.User;

/**
 * Saas-only sidecar that holds user-level fields irrelevant to OSS / proprietary deployments
 * (metered-billing flag, API-key first-use audit timestamp). Keeping these off the proprietary
 * {@link User} entity prevents the {@code users} table from acquiring saas-only columns under OSS
 * Hibernate {@code ddl-auto=update}.
 *
 * <p>1:1 with {@link User}; user_id is both PK and FK. Created lazily on first saas-mode access via
 * {@code SaasUserExtensionService.getOrCreate(User)}.
 */
@Entity
@Table(name = "saas_user_extensions")
@Cacheable
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE, region = "saas-user-extensions")
@NoArgsConstructor
@Getter
@Setter
public class SaasUserExtensions implements Serializable, Persistable<Long> {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "user_id")
    private Long userId;

    @OneToOne(fetch = FetchType.LAZY)
    @MapsId
    @JoinColumn(name = "user_id")
    @OnDelete(action = OnDeleteAction.CASCADE)
    private User user;

    @Column(name = "has_metered_billing_enabled", nullable = false)
    private Boolean hasMeteredBillingEnabled = Boolean.FALSE;

    @Column(name = "api_key_first_used_at")
    private LocalDateTime apiKeyFirstUsedAt;

    // Durable "home team" the user returns to when leaving a joined team; distinct from the
    // active users.team_id. Plain id (not a @ManyToOne) to avoid an eager Team load. Nullable.
    @Column(name = "home_team_id")
    private Long homeTeamId;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public SaasUserExtensions(User user) {
        // @MapsId derives userId from user.id at persist time; setting both keeps in-memory
        // reads consistent before flush.
        this.user = user;
        this.userId = user.getId();
    }

    public boolean isMeteredBillingEnabled() {
        return Boolean.TRUE.equals(hasMeteredBillingEnabled);
    }

    @Override
    public Long getId() {
        return userId;
    }

    // Decided on the timestamp, not the id: the constructor pre-sets the @MapsId id, so an
    // id-based check would route a new row to merge() and fail with "null identifier".
    @Override
    @Transient
    public boolean isNew() {
        return createdAt == null;
    }
}
