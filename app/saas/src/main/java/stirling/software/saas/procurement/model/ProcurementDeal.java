package stirling.software.saas.procurement.model;

import java.io.Serializable;
import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * A linked team's enterprise commercial journey (one per team). Stage mirrors the buyer journey the
 * portal renders (trial -&gt; quote -&gt; agreement -&gt; payment -&gt; live). The entitlement that
 * actually unlocks the product is the Keygen licence in {@code licenseRef}; the paid subscription,
 * once commercial, is mirrored in {@code billing_subscriptions} and referenced by {@code
 * subscriptionId}.
 */
@Entity
@Table(name = "procurement_deal")
@NoArgsConstructor
@Getter
@Setter
public class ProcurementDeal implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String STAGE_TRIAL = "trial";
    public static final String STAGE_QUOTE = "quote";
    public static final String STAGE_AGREEMENT = "security";
    public static final String STAGE_PAYMENT = "procurement";
    public static final String STAGE_LIVE = "active";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "deal_id")
    private Long dealId;

    @Column(name = "team_id", nullable = false, unique = true)
    private Long teamId;

    @Column(name = "stage", nullable = false, length = 32)
    private String stage = STAGE_TRIAL;

    @Column(name = "trial_started_at")
    private LocalDateTime trialStartedAt;

    @Column(name = "trial_ends_at")
    private LocalDateTime trialEndsAt;

    @Column(name = "trial_extensions_used", nullable = false)
    private int trialExtensionsUsed;

    @Column(name = "license_ref", length = 128)
    private String licenseRef;

    @Column(name = "subscription_id", length = 255)
    private String subscriptionId;

    @Column(name = "accepted_quote_id")
    private Long acceptedQuoteId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    public ProcurementDeal(Long teamId) {
        this.teamId = teamId;
    }
}
