package stirling.software.saas.payg.entitlement;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import stirling.software.saas.payg.model.EntitlementState;
import stirling.software.saas.payg.model.FeatureGate;
import stirling.software.saas.payg.model.FeatureSet;

/**
 * Cached entitlement state for the team (one row with {@code user_id = 0}, the team-wide sentinel)
 * plus optional per-member rows when a member sub-cap is configured. Read on the hot path by the
 * entitlement guard.
 *
 * <p>Composite PK {@code (team_id, user_id)} uses 0 as the team-wide sentinel because Postgres
 * treats {@code NULL} as not-equal-to-NULL in unique constraints — 0 keeps the PK well-defined.
 *
 * <p>No {@code @Version} — rows are produced by full-row recompute, no read-modify-write race.
 */
@Entity
@Table(name = "wallet_entitlement_snapshot")
@NoArgsConstructor
@Getter
@Setter
public class WalletEntitlementSnapshot implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final long TEAM_WIDE_USER_ID = 0L;

    @EmbeddedId private WalletEntitlementSnapshotId id;

    @Column(name = "period_start", nullable = false)
    private LocalDateTime periodStart;

    @Column(name = "period_end", nullable = false)
    private LocalDateTime periodEnd;

    @Column(name = "period_spend_units", nullable = false)
    private Long periodSpendUnits = 0L;

    @Column(name = "period_cap_units")
    private Long periodCapUnits;

    @Enumerated(EnumType.STRING)
    @Column(name = "state", nullable = false, length = 16)
    private EntitlementState state = EntitlementState.FULL;

    @Enumerated(EnumType.STRING)
    @Column(name = "feature_set", nullable = false, length = 32)
    private FeatureSet featureSet = FeatureSet.FULL;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "enabled_gates", columnDefinition = "jsonb", nullable = false)
    private List<FeatureGate> enabledGates = new ArrayList<>();

    @CreationTimestamp
    @Column(name = "computed_at", nullable = false, updatable = false)
    private LocalDateTime computedAt;

    @Embeddable
    @NoArgsConstructor
    @Getter
    @Setter
    public static class WalletEntitlementSnapshotId implements Serializable {

        private static final long serialVersionUID = 1L;

        @Column(name = "team_id", nullable = false)
        private Long teamId;

        /** Use {@link #TEAM_WIDE_USER_ID} for the team-wide row. */
        @Column(name = "user_id", nullable = false)
        private Long userId;

        public WalletEntitlementSnapshotId(Long teamId, Long userId) {
            this.teamId = teamId;
            this.userId = userId;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof WalletEntitlementSnapshotId other)) return false;
            return Objects.equals(teamId, other.teamId) && Objects.equals(userId, other.userId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(teamId, userId);
        }
    }
}
