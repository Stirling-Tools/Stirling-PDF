package stirling.software.proprietary.model;

import java.io.Serializable;
import java.time.Instant;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.*;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import lombok.*;

import stirling.software.proprietary.security.model.User;

@Entity
@Table(
        name = "api_credit_configs",
        uniqueConstraints = {
            @UniqueConstraint(
                    name = "uq_user_credit_cfg",
                    columnNames = {"scope_type", "user_id"}),
            @UniqueConstraint(
                    name = "uq_org_credit_cfg",
                    columnNames = {"scope_type", "org_id"}),
            @UniqueConstraint(
                    name = "uq_role_credit_cfg",
                    columnNames = {"scope_type", "role_name"})
        },
        indexes = {
            @Index(name = "idx_credit_cfg_user", columnList = "user_id"),
            @Index(name = "idx_credit_cfg_org", columnList = "org_id"),
            @Index(name = "idx_credit_cfg_role", columnList = "role_name"),
            @Index(name = "idx_credit_cfg_scope", columnList = "scope_type")
        })
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Getter
@Setter
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@ToString(onlyExplicitlyIncluded = true)
public class ApiCreditConfig implements Serializable {

    private static final long serialVersionUID = 1L;

    public enum ScopeType {
        USER,
        ORGANIZATION,
        ROLE_DEFAULT
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    @EqualsAndHashCode.Include
    @ToString.Include
    private Long id;

    @NotNull
    @Column(name = "scope_type", nullable = false, length = 20)
    @Enumerated(EnumType.STRING)
    private ScopeType scopeType;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = true)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "org_id", nullable = true)
    private Organization organization;

    @Column(name = "role_name", nullable = true, length = 50)
    private String roleName;

    @NotNull
    @Min(0)
    @Column(name = "monthly_credits", nullable = false)
    private Integer monthlyCredits;

    @NotNull
    @Builder.Default
    @Column(name = "is_pooled", nullable = false)
    private Boolean isPooled = false;

    @NotNull
    @Builder.Default
    @Column(name = "is_active", nullable = false)
    private Boolean isActive = true;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false, nullable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version")
    private Long version;

    @PrePersist
    @PreUpdate
    protected void validateScope() {
        int nonNullCount = 0;
        if (user != null) nonNullCount++;
        if (organization != null) nonNullCount++;
        if (roleName != null) nonNullCount++;

        if (nonNullCount != 1) {
            throw new IllegalStateException(
                    "Exactly one of user, organization, or roleName must be set");
        }

        if (user != null && scopeType != ScopeType.USER) {
            throw new IllegalStateException("ScopeType must be USER when user is set");
        }
        if (organization != null && scopeType != ScopeType.ORGANIZATION) {
            throw new IllegalStateException(
                    "ScopeType must be ORGANIZATION when organization is set");
        }
        if (roleName != null && scopeType != ScopeType.ROLE_DEFAULT) {
            throw new IllegalStateException("ScopeType must be ROLE_DEFAULT when roleName is set");
        }

        if (Boolean.TRUE.equals(isPooled) && scopeType != ScopeType.ORGANIZATION) {
            throw new IllegalStateException("isPooled can only be true for ORGANIZATION scope");
        }
    }
}
