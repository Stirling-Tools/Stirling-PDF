package stirling.software.saas.payg.wallet;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import stirling.software.saas.payg.model.AutoGroupStrategy;
import stirling.software.saas.payg.model.CapPeriod;
import stirling.software.saas.payg.model.FeatureSet;
import stirling.software.saas.payg.model.WalletEngine;

/**
 * Per-team wallet configuration: charging engine, period spend cap, warn/degrade thresholds, the
 * degraded feature set, and the lineage-detection strategy.
 *
 * <p><b>No {@code @Version} column by design.</b> Wallet-policy writes only come from admin tooling
 * (cap set, engine flip, threshold change) — never from the request hot path — so concurrent writes
 * are essentially impossible. The cost of optimistic-lock retries on a cold-path admin endpoint
 * outweighs the benefit, and the policy carries no field whose read-modify-write semantics would be
 * subtly broken without a version column. If we ever start mutating this from multiple writers
 * (e.g. an automated trial-converter), add {@code @Version} then.
 */
@Entity
@Table(name = "wallet_policy")
@NoArgsConstructor
@Getter
@Setter
public class WalletPolicy implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "policy_id")
    private Long id;

    @Column(name = "team_id", nullable = false, unique = true)
    private Long teamId;

    @Enumerated(EnumType.STRING)
    @Column(name = "engine", nullable = false, length = 16)
    private WalletEngine engine = WalletEngine.LEGACY;

    @Enumerated(EnumType.STRING)
    @Column(name = "cap_period", nullable = false, length = 16)
    private CapPeriod capPeriod = CapPeriod.CALENDAR_MONTH;

    /** Null = unlimited. Doc-units per period. */
    @Column(name = "cap_units")
    private Long capUnits;

    /**
     * Original money cap input ("$50/month") in smallest currency unit; null if set as units. The
     * currency comes from {@code stripe.customers.currency} at recompute time — we don't duplicate
     * it here.
     */
    @Column(name = "cap_source_money")
    private Long capSourceMoney;

    @Column(name = "warn_at_pct", nullable = false)
    private Integer warnAtPct = 80;

    @Column(name = "degrade_at_pct", nullable = false)
    private Integer degradeAtPct = 100;

    @Enumerated(EnumType.STRING)
    @Column(name = "degraded_feature_set", nullable = false, length = 32)
    private FeatureSet degradedFeatureSet = FeatureSet.MINIMAL;

    @Enumerated(EnumType.STRING)
    @Column(name = "auto_group_strategy", nullable = false, length = 16)
    private AutoGroupStrategy autoGroupStrategy = AutoGroupStrategy.AUTO;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "notification_emails", columnDefinition = "jsonb", nullable = false)
    private List<String> notificationEmails = new ArrayList<>();

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
