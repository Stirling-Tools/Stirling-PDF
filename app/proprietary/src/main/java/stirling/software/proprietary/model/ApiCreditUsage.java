package stirling.software.proprietary.model;

import java.io.Serializable;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneOffset;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.*;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import lombok.*;

import stirling.software.proprietary.security.model.User;

@Entity
@Table(
        name = "api_credit_usage",
        uniqueConstraints = {
            @UniqueConstraint(
                    name = "uq_credit_user_month",
                    columnNames = {"user_id", "month_key"}),
            @UniqueConstraint(
                    name = "uq_credit_org_month",
                    columnNames = {"org_id", "month_key"})
        },
        indexes = {
            @Index(name = "idx_credit_usage_user_month", columnList = "user_id, month_key"),
            @Index(name = "idx_credit_usage_org_month", columnList = "org_id, month_key"),
            @Index(name = "idx_credit_usage_month", columnList = "month_key")
        })
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Getter
@Setter
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@ToString(onlyExplicitlyIncluded = true)
public class ApiCreditUsage implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    @EqualsAndHashCode.Include
    @ToString.Include
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = true)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "org_id", nullable = true)
    private Organization organization;

    @NotNull
    @Column(name = "month_key", nullable = false, length = 7)
    @ToString.Include
    private YearMonth monthKey;

    @NotNull
    @Min(0)
    @Builder.Default
    @Column(name = "credits_consumed", nullable = false)
    private Integer creditsConsumed = 0;

    @NotNull
    @Min(0)
    @Builder.Default
    @Column(name = "credits_allocated", nullable = false)
    private Integer creditsAllocated = 0;

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
        if ((user == null && organization == null) || (user != null && organization != null)) {
            throw new IllegalStateException("Exactly one of user or organization must be set");
        }
    }

    public static YearMonth getCurrentMonth() {
        return YearMonth.now(ZoneOffset.UTC);
    }

    public static ApiCreditUsage forUser(User user, int creditsAllocated) {
        return ApiCreditUsage.builder()
                .user(user)
                .monthKey(getCurrentMonth())
                .creditsConsumed(0)
                .creditsAllocated(creditsAllocated)
                .build();
    }

    public static ApiCreditUsage forOrganization(Organization org, int creditsAllocated) {
        return ApiCreditUsage.builder()
                .organization(org)
                .monthKey(getCurrentMonth())
                .creditsConsumed(0)
                .creditsAllocated(creditsAllocated)
                .build();
    }

    public int getRemainingCredits() {
        return Math.max(0, creditsAllocated - creditsConsumed);
    }

    public boolean hasCreditsRemaining(int creditCost) {
        return getRemainingCredits() >= creditCost;
    }
}
