package stirling.software.saas.payg.policy;

import java.io.Serializable;
import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import stirling.software.proprietary.model.Team;

/**
 * Sidecar carrying PAYG-only team fields. 1:1 with {@link Team} via shared PK so OSS Hibernate
 * (which only sees the proprietary {@link Team} entity) never tries to add PAYG columns to the
 * shared {@code teams} table. Mirrors the existing {@code SaasTeamExtensions} pattern.
 *
 * <p>Created lazily on first PAYG access for a team.
 */
@Entity
@Table(name = "payg_team_extensions")
@NoArgsConstructor
@Getter
@Setter
public class PaygTeamExtensions implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "team_id")
    private Long teamId;

    @OneToOne(fetch = FetchType.LAZY)
    @MapsId
    @JoinColumn(name = "team_id")
    @OnDelete(action = OnDeleteAction.CASCADE)
    private Team team;

    /** Per-team policy override; NULL means use the default row in {@code pricing_policy}. */
    @Column(name = "pricing_policy_id")
    private Long pricingPolicyId;

    /** Stripe customer id for this team. Eager-created so every team has billing identity. */
    @Column(name = "stripe_customer_id", unique = true, length = 128)
    private String stripeCustomerId;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Version
    @Column(name = "version")
    private Long version;

    public PaygTeamExtensions(Team team) {
        this.team = team;
        this.teamId = team.getId();
    }
}
